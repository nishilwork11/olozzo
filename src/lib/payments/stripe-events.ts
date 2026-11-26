import "server-only";
import type Stripe from "stripe";
import { audit } from "../audit";
import { db } from "../db";
import { notifyAdmins, notifyRefund } from "../email/notify";
import { formatMoney } from "../money";
import { flagPaymentForReview, markOrderPaid, markOrderRefunded, markPaymentFailed, markPaymentPending } from "../orders";
import { paymentLog, type PaymentLogLevel } from "./log";
import { describePaymentError, paymentIntentDetails, refundDetails, sessionDetails } from "./log-details";
import { getStripeSession, paymentIntentIdOf, stripe } from "./stripe";

/** The events to enable on the webhook endpoint in the Stripe Dashboard. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded",
  "refund.failed",
  "charge.dispute.created",
] as const;

/** Who asked Stripe about a Checkout Session, recorded in the payment log. */
export type SyncSource = "webhook" | "return" | "admin" | "cancel" | "reconcile";

const SOURCE_LABELS: Record<SyncSource, string> = {
  webhook: "Stripe webhook",
  return: "order page opened",
  admin: "checked by staff",
  cancel: "while closing the payment page",
  reconcile: "automatic check",
};

/**
 * A delayed payment (e.g. SEPA Direct Debit) the bank refused. Needs the session's payment_intent expanded,
 * as getStripeSession does.
 */
function delayedPaymentFailed(session: Stripe.Checkout.Session): boolean {
  const pi = session.payment_intent;
  return typeof pi === "object" && pi !== null && (pi.status === "requires_payment_method" || pi.status === "canceled");
}

/** Why the bank refused a delayed payment, from the session's expanded PaymentIntent. */
function delayedFailureReason(session: Stripe.Checkout.Session): string {
  const pi = session.payment_intent;
  const error = typeof pi === "object" && pi !== null ? pi.last_payment_error : null;
  return error ? `The bank did not confirm the payment: ${describePaymentError(error)}` : "The bank did not confirm the payment";
}

/**
 * Bring an order in line with its Checkout Session (Stripe's "fulfill_checkout"). Used by the webhook, by the order
 * page when the customer returns (in case the webhook is late or unreachable, e.g. on localhost), by staff and by the
 * automatic check. Safe to call repeatedly and concurrently: every order transition is a conditional update.
 * Pass a session freshly retrieved with getStripeSession. Returns the order id it applied to, if any.
 * Every call is written to the payment log with what Stripe reported and what changed (the automatic check only
 * logs changes, so it doesn't repeat itself every run).
 */
export async function applyCheckoutSession(
  session: Stripe.Checkout.Session,
  opts: { delayedPaymentFailed?: boolean; source?: SyncSource; event?: Stripe.Event } = {},
): Promise<string | null> {
  const source = opts.source ?? "webhook";
  const via = opts.event ? `${SOURCE_LABELS[source]} ${opts.event.type}` : SOURCE_LABELS[source];
  const data = { source, ...(opts.event ? { event: opts.event.id, event_type: opts.event.type } : {}), ...sessionDetails(session) };

  const orderId = session.metadata?.orderId;
  const order = orderId ? await db.order.findUnique({ where: { id: orderId } }) : null;
  if (!order || order.paymentProvider !== "stripe") {
    await paymentLog({
      orderId: order?.id,
      level: "WARN",
      event: "session.unmatched",
      ref: session.id,
      data,
      message: !orderId
        ? `Checkout Session has no order id, so it was not created by this shop; ignored (${via})`
        : order
          ? `Order ${order.number} is not paid with Stripe; session ignored (${via})`
          : `No order ${orderId} exists for this Checkout Session; ignored (${via})`,
    });
    return null;
  }
  // Each order has exactly one session; ignore any other
  if (order.paymentRef && order.paymentRef !== session.id) {
    await paymentLog({
      orderId: order.id,
      level: "WARN",
      event: "session.mismatch",
      ref: session.id,
      data,
      message: `Session ${session.id} is not this order's payment page (${order.paymentRef}); ignored (${via})`,
    });
    return null;
  }
  const paymentIntentId = paymentIntentIdOf(session);
  const amount = formatMoney(session.amount_total ?? 0);

  let event: string;
  let message: string;
  let level: PaymentLogLevel = "INFO";
  let changed = false;

  // Anything but "unpaid" can be fulfilled: "paid", or "no_payment_required" for a zero total
  if (session.status === "complete" && session.payment_status !== "unpaid") {
    if (session.amount_total !== order.total || session.currency !== order.currency.toLowerCase()) {
      const reason = `Stripe charged ${amount} ${session.currency?.toUpperCase()} but the order total is ${formatMoney(order.total)}`;
      await flagPaymentForReview(order.id, reason);
      await paymentLog({
        orderId: order.id,
        level: "ERROR",
        event: "payment.amount_mismatch",
        ref: session.id,
        data,
        message: `${reason}. Not sent to suppliers: check the payment and refund it in Stripe (${via})`,
      });
      return order.id;
    }
    changed = await markOrderPaid(order.id, session.id, paymentIntentId);
    event = "payment.paid";
    message = changed ? `Payment of ${amount} confirmed; order marked paid and sent to suppliers` : `Payment of ${amount} confirmed`;
  } else if (session.status === "complete") {
    // Submitted with a delayed method; the bank confirms or refuses it later
    if (opts.delayedPaymentFailed || delayedPaymentFailed(session)) {
      message = delayedFailureReason(session);
      changed = await markPaymentFailed(order.id, message);
      event = "payment.failed";
      level = "WARN";
    } else {
      changed = await markPaymentPending(order.id, paymentIntentId);
      event = "payment.pending";
      message = "Payment submitted with a bank method; waiting for the bank to confirm it";
    }
  } else if (session.status === "expired") {
    message = "The payment page expired before payment was completed";
    changed = await markPaymentFailed(order.id, message);
    event = "payment.expired";
  } else {
    event = "payment.open";
    message = "The payment page is still open; nothing has been paid yet";
  }

  if (changed && source === "reconcile") {
    // The automatic check only finds orders the webhook (and the customer's return) should already have settled
    if (level === "INFO") level = "WARN";
    message += ". The webhook never delivered this: check the endpoint's deliveries in the Stripe Dashboard";
  }
  if (changed || source !== "reconcile") {
    const noChange = !changed && event !== "payment.open" ? ", already recorded" : "";
    await paymentLog({ orderId: order.id, level, event, ref: session.id, data: { ...data, changed }, message: `${message} (${via}${noChange})` });
  }
  return order.id;
}

/**
 * The order a charge belongs to. Stripe does not guarantee event order, so a refund or dispute can arrive
 * before the payment was recorded here: fall back to the PaymentIntent's metadata, and bring an order that is
 * not paid yet up to date with its Checkout Session first.
 */
async function orderForPaymentIntent(pi: string | Stripe.PaymentIntent | null, event: Stripe.Event) {
  const id = typeof pi === "string" ? pi : pi?.id;
  if (!id) return null;
  let order = await db.order.findUnique({ where: { paymentIntentId: id } });
  if (!order) {
    const intent = typeof pi === "object" && pi !== null ? pi : await stripe().paymentIntents.retrieve(id);
    const orderId = intent.metadata?.orderId;
    order = orderId ? await db.order.findUnique({ where: { id: orderId } }) : null;
    if (!order || order.paymentProvider !== "stripe") return null; // not a payment made through this platform
  }
  if (["UNPAID", "PENDING", "FAILED"].includes(order.paymentStatus) && order.paymentRef) {
    await applyCheckoutSession(await getStripeSession(order.paymentRef), { source: "webhook", event });
    order = await db.order.findUnique({ where: { id: order.id } });
  }
  return order;
}

/** The order an event is about, when its object carries our metadata (for logging a delivery that failed). */
export function orderIdOfEvent(event: Stripe.Event): string | null {
  const object = event.data.object as { metadata?: Record<string, string> | null };
  return object.metadata?.orderId ?? null;
}

/** Handle one verified webhook event. Throws on a database error so Stripe retries the delivery. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (await db.stripeEvent.findUnique({ where: { id: event.id } })) return; // already processed

  let orderId: string | null = null;
  let summary: string | null = null;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      // Events can arrive late, twice or out of order: act on the session as it is now, not on the event's snapshot
      const session = await getStripeSession(event.data.object.id);
      orderId = await applyCheckoutSession(session, {
        delayedPaymentFailed: event.type === "checkout.session.async_payment_failed",
        source: "webhook",
        event,
      });
      summary = `status=${session.status} payment_status=${session.payment_status}`;
      break;
    }

    case "payment_intent.payment_failed": {
      // One failed attempt: card declined, 3-D Secure not completed, debit refused… On the payment page the customer
      // can simply try again, so the order is left as it is; the session's completion or expiry settles it.
      const intent = event.data.object;
      const order = await db.order.findUnique({
        where: intent.metadata?.orderId ? { id: intent.metadata.orderId } : { paymentIntentId: intent.id },
      });
      if (!order || order.paymentProvider !== "stripe") break; // not a payment made through this platform
      orderId = order.id;
      const reason = describePaymentError(intent.last_payment_error);
      summary = `attempt failed: ${reason}`;
      await paymentLog({
        orderId,
        level: "WARN",
        event: "payment.declined",
        ref: intent.id,
        data: { event: event.id, ...paymentIntentDetails(intent) },
        message: `Payment attempt of ${formatMoney(intent.amount)} failed: ${reason}`,
      });
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const order = await orderForPaymentIntent(charge.payment_intent, event);
      if (!order) break;
      orderId = order.id;
      summary = `refunded ${formatMoney(charge.amount_refunded)} of ${formatMoney(charge.amount)}`;
      // A full refund made anywhere (our refund button or the Stripe Dashboard) closes the order.
      // Partial refunds are recorded in the logs only.
      const closed = charge.refunded ? await markOrderRefunded(order.id, `${order.number} refunded via Stripe (${summary})`) : false;
      await paymentLog({
        orderId,
        event: "refund.recorded",
        ref: charge.id,
        data: { event: event.id, charge: charge.id, amount: charge.amount, amount_refunded: charge.amount_refunded, refunded: charge.refunded },
        message: `Stripe reports a ${charge.refunded ? "full" : "partial"} refund: ${summary}${closed ? "; order closed as refunded" : ""}`,
      });
      // markOrderRefunded told the customer about a full refund; a partial one is announced here
      if (!charge.refunded && charge.amount_refunded > 0 && order.paymentStatus === "PAID") {
        await notifyRefund(order.id, { full: false, refundedSoFar: charge.amount_refunded });
      }
      break;
    }

    case "refund.failed": {
      // Stripe accepted the refund but could not return the money (e.g. the card was closed). The order may already
      // show as refunded, so staff must pay the customer back another way.
      const refund = event.data.object;
      const order = await orderForPaymentIntent(refund.payment_intent, event);
      if (!order) break;
      orderId = order.id;
      summary = `refund of ${formatMoney(refund.amount)} failed: ${refund.failure_reason ?? "no reason given"}`;
      await paymentLog({
        orderId,
        level: "ERROR",
        event: "refund.failed",
        ref: refund.id,
        data: { event: event.id, ...refundDetails(refund) },
        message: `Stripe could not return ${formatMoney(refund.amount)} to the customer (${refund.failure_reason ?? "no reason given"}). Refund them another way`,
      });
      await audit(null, "order.refund_failed", "Order", order.id, summary);
      await notifyAdmins({
        kind: "refund_failed",
        orderId: order.id,
        ref: refund.id,
        title: "Refund failed",
        message: `Stripe could not return ${formatMoney(refund.amount)} to the customer (${refund.failure_reason ?? "no reason given"}). Refund them another way.`,
      });
      break;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object;
      const order = await orderForPaymentIntent(dispute.payment_intent, event);
      if (!order) break;
      orderId = order.id;
      summary = `dispute opened: ${dispute.reason} (${formatMoney(dispute.amount)})`;
      const dueBy = dispute.evidence_details?.due_by;
      await paymentLog({
        orderId,
        level: "ERROR",
        event: "dispute.created",
        ref: dispute.id,
        data: {
          event: event.id,
          dispute: dispute.id,
          reason: dispute.reason,
          amount: dispute.amount,
          status: dispute.status,
          evidence_due_by: dueBy ? new Date(dueBy * 1000).toISOString() : undefined,
        },
        message: `The customer disputed the payment (${dispute.reason}, ${formatMoney(dispute.amount)}). Respond in the Stripe Dashboard before the evidence deadline`,
      });
      await audit(null, "order.disputed", "Order", order.id, summary);
      await notifyAdmins({
        kind: "dispute",
        orderId: order.id,
        ref: dispute.id,
        title: "Payment disputed",
        message: `The customer disputed the payment (${dispute.reason}, ${formatMoney(dispute.amount)}). Respond in the Stripe Dashboard${
          dueBy ? ` by ${new Date(dueBy * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : " before the evidence deadline"
        }.`,
      });
      break;
    }

    default:
      return; // not subscribed to anything else; nothing to record
  }

  await db.stripeEvent.createMany({ data: [{ id: event.id, type: event.type, orderId, summary }], skipDuplicates: true });
}
