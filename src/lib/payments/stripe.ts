import "server-only";
import Stripe from "stripe";
import { stripeKeyMode } from "./rules";

let client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeMode() {
  return stripeKeyMode(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  // The SDK pins its own API version (stripe@23.0.1 → 2026-09-30.endive). Register the webhook endpoint on the same version.
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
  return client;
}

type OrderLike = { id: string; number: string; email: string; total: number; paymentExpiresAt: Date | null };

/**
 * Stripe Checkout. Leaving `payment_method_types` unset lets Stripe show every method enabled in
 * your Dashboard that fits the customer — cards, Apple/Google Pay, SEPA, iDEAL, Bancontact, EPS,
 * Przelewy24, Klarna…
 *
 * The amount is the server-calculated order total (VAT and shipping included), sent as one line so Stripe
 * charges exactly what the order says. The idempotency key makes a retried request return the same session.
 */
export async function createStripeCheckout(
  order: OrderLike,
  opts: { storeName: string; summary: string; successUrl: string; cancelUrl: string },
) {
  return stripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: order.email,
      client_reference_id: order.id,
      metadata: { orderId: order.id, orderNumber: order.number },
      payment_intent_data: {
        description: `${opts.storeName} order ${order.number}`,
        metadata: { orderId: order.id, orderNumber: order.number },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: order.total,
            product_data: {
              name: `${opts.storeName} — order ${order.number}`,
              description: `${opts.summary} · VAT and shipping included`,
            },
          },
        },
      ],
      ...(order.paymentExpiresAt ? { expires_at: Math.floor(order.paymentExpiresAt.getTime() / 1000) } : {}),
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    },
    { idempotencyKey: `checkout-session-${order.id}` },
  );
}

/** The current state of a Checkout Session, with its PaymentIntent (to tell a failed delayed payment from a pending one). */
export async function getStripeSession(sessionId: string) {
  return stripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
}

/** stripe-node turns HTTP 403, e.g. a restricted key without the needed permission, into a StripePermissionError. */
function permissionDenied(err: unknown): boolean {
  return err instanceof Stripe.errors.StripePermissionError;
}

/**
 * A payment with its latest charge (payment method, refunds, dispute, receipt). Loading the charge needs read access to
 * Charges: with a restricted key that lacks it, the payment comes without its charge and `chargeAccess` is false.
 */
export async function getStripePayment(paymentIntentId: string) {
  try {
    return { payment: await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }), chargeAccess: true };
  } catch (err) {
    if (!permissionDenied(err)) throw err;
    return { payment: await stripe().paymentIntents.retrieve(paymentIntentId), chargeAccess: false };
  }
}

/** The account's latest payments, newest first, with their charges when the key may read them (see getStripePayment). */
export async function listStripePayments(opts: { limit: number; startingAfter?: string }) {
  const params = { limit: opts.limit, ...(opts.startingAfter ? { starting_after: opts.startingAfter } : {}) };
  try {
    return { page: await stripe().paymentIntents.list({ ...params, expand: ["data.latest_charge"] }), chargeAccess: true };
  } catch (err) {
    if (!permissionDenied(err)) throw err;
    return { page: await stripe().paymentIntents.list(params), chargeAccess: false };
  }
}

/** What Stripe says right now about an order's Checkout Session and payment. `payment` is null until the customer submits one. */
export async function getStripeOrderPayment(order: { paymentRef: string | null; paymentIntentId: string | null }) {
  const [session, known] = await Promise.all([
    order.paymentRef ? stripe().checkout.sessions.retrieve(order.paymentRef) : null,
    order.paymentIntentId ? getStripePayment(order.paymentIntentId) : null,
  ]);
  const paymentIntentId = known ? null : session && paymentIntentIdOf(session);
  const found = known ?? (paymentIntentId ? await getStripePayment(paymentIntentId) : null);
  return { session, payment: found?.payment ?? null, chargeAccess: found?.chargeAccess ?? true };
}

export function paymentIntentIdOf(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

/**
 * Close a Checkout Session so it can no longer be paid. Returns "complete" when the customer already
 * finished it (then it must be honoured, not cancelled).
 */
export async function expireStripeSession(sessionId: string): Promise<"expired" | "complete"> {
  const session = await getStripeSession(sessionId);
  if (session.status === "complete") return "complete";
  if (session.status === "expired") return "expired";
  try {
    await stripe().checkout.sessions.expire(sessionId);
    return "expired";
  } catch (err) {
    // The customer may have completed it in the meantime
    const latest = await getStripeSession(sessionId);
    if (latest.status === "complete") return "complete";
    if (latest.status === "expired") return "expired";
    throw err;
  }
}

/**
 * Refund a Stripe payment, fully or partly. No idempotency key on purpose: Stripe would replay a failed
 * attempt (e.g. insufficient balance) for 24 hours. A second full refund is refused by Stripe anyway,
 * because it exceeds what is left to refund.
 */
export async function refundStripe(order: { id: string; paymentRef: string | null; paymentIntentId: string | null }, amount: number) {
  let paymentIntent = order.paymentIntentId;
  if (!paymentIntent && order.paymentRef) paymentIntent = paymentIntentIdOf(await getStripeSession(order.paymentRef));
  if (!paymentIntent) throw new Error("No Stripe payment found for this order");
  return stripe().refunds.create({ payment_intent: paymentIntent, amount, metadata: { orderId: order.id } });
}
