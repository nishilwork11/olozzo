import "server-only";
import type Stripe from "stripe";
import { db } from "../db";
import { formatMoney } from "../money";
import { flagPaymentForReview, markOrderPaid, markOrderRefunded, markPaymentFailed, markPaymentPending } from "../orders";
import { getStripeSession, paymentIntentIdOf, stripe } from "./stripe";

/** The events to enable on the webhook endpoint in the Stripe Dashboard. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
] as const;

/**
 * A delayed payment (e.g. SEPA Direct Debit) the bank refused. Needs the session's payment_intent expanded,
 * as getStripeSession does.
 */
function delayedPaymentFailed(session: Stripe.Checkout.Session): boolean {
  const pi = session.payment_intent;
  return typeof pi === "object" && pi !== null && (pi.status === "requires_payment_method" || pi.status === "canceled");
}

/**
 * Bring an order in line with its Checkout Session (Stripe's "fulfill_checkout"). Used by the webhook and by
 * the order page when the customer returns (in case the webhook is late or unreachable, e.g. on localhost).
 * Safe to call repeatedly and concurrently: every order transition is a conditional update.
 * Pass a session freshly retrieved with getStripeSession. Returns the order id it applied to, if any.
 */
export async function applyCheckoutSession(
  session: Stripe.Checkout.Session,
  opts: { delayedPaymentFailed?: boolean } = {},
): Promise<string | null> {
  const orderId = session.metadata?.orderId;
  if (!orderId) return null;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentProvider !== "stripe") return null;
  // Each order has exactly one session; ignore any other
  if (order.paymentRef && order.paymentRef !== session.id) {
    console.warn(`[stripe] session ${session.id} does not belong to order ${order.number}`);
    return null;
  }
  const paymentIntentId = paymentIntentIdOf(session);

  // Anything but "unpaid" can be fulfilled: "paid", or "no_payment_required" for a zero total
  if (session.status === "complete" && session.payment_status !== "unpaid") {
    if (session.amount_total !== order.total || session.currency !== order.currency.toLowerCase()) {
      await flagPaymentForReview(
        order.id,
        `Stripe charged ${formatMoney(session.amount_total ?? 0)} ${session.currency?.toUpperCase()} but the order total is ${formatMoney(order.total)}`,
      );
      return order.id;
    }
    await markOrderPaid(order.id, session.id, paymentIntentId);
  } else if (session.status === "complete") {
    // Submitted with a delayed method; the bank confirms or refuses it later
    if (opts.delayedPaymentFailed || delayedPaymentFailed(session)) await markPaymentFailed(order.id, "The bank did not confirm the payment");
    else await markPaymentPending(order.id, paymentIntentId);
  } else if (session.status === "expired") {
    await markPaymentFailed(order.id, "The payment page expired before payment was completed");
  }
  return order.id;
}

/**
 * The order a charge belongs to. Stripe does not guarantee event order, so a refund or dispute can arrive
 * before the payment was recorded here: fall back to the PaymentIntent's metadata, and bring an order that is
 * not paid yet up to date with its Checkout Session first.
 */
async function orderForPaymentIntent(pi: string | Stripe.PaymentIntent | null) {
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
    await applyCheckoutSession(await getStripeSession(order.paymentRef));
    order = await db.order.findUnique({ where: { id: order.id } });
  }
  return order;
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
      orderId = await applyCheckoutSession(session, { delayedPaymentFailed: event.type === "checkout.session.async_payment_failed" });
      summary = `status=${session.status} payment_status=${session.payment_status}`;
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const order = await orderForPaymentIntent(charge.payment_intent);
      if (!order) break;
      orderId = order.id;
      summary = `refunded ${formatMoney(charge.amount_refunded)} of ${formatMoney(charge.amount)}`;
      // A full refund made anywhere (our refund button or the Stripe Dashboard) closes the order.
      // Partial refunds are recorded in the event log only.
      if (charge.refunded) await markOrderRefunded(order.id, `${order.number} refunded via Stripe (${summary})`);
      break;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object;
      const order = await orderForPaymentIntent(dispute.payment_intent);
      if (!order) break;
      orderId = order.id;
      summary = `dispute opened: ${dispute.reason} (${formatMoney(dispute.amount)})`;
      console.error(`[stripe] ${summary} on order ${order.number}`);
      break;
    }

    default:
      return; // not subscribed to anything else; nothing to record
  }

  await db.stripeEvent.createMany({ data: [{ id: event.id, type: event.type, orderId, summary }], skipDuplicates: true });
}
