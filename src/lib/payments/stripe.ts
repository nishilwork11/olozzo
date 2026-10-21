import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

type OrderLike = { id: string; number: string; email: string; total: number };

/**
 * Stripe Checkout. Leaving `payment_method_types` unset lets Stripe show every method enabled in
 * your Dashboard that fits the customer — cards, Apple/Google Pay, SEPA, iDEAL, Bancontact, EPS,
 * Przelewy24, Klarna…
 */
export async function createStripeCheckout(
  order: OrderLike,
  opts: { storeName: string; storeSlug: string; itemCount: number; baseUrl: string },
) {
  return stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: order.email,
    client_reference_id: order.id,
    metadata: { orderId: order.id, orderNumber: order.number },
    payment_intent_data: { metadata: { orderId: order.id, orderNumber: order.number } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: order.total,
          product_data: {
            name: `${opts.storeName} — order ${order.number}`,
            description: `${opts.itemCount} item(s), VAT and shipping included`,
          },
        },
      },
    ],
    success_url: `${opts.baseUrl}/s/${opts.storeSlug}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.baseUrl}/s/${opts.storeSlug}/checkout?cancelled=1`,
  });
}

export async function isStripeSessionPaid(sessionId: string, orderId: string): Promise<boolean> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  return session.metadata?.orderId === orderId && session.payment_status === "paid";
}

export async function refundStripe(sessionId: string, amount?: number) {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntent) throw new Error("No payment intent found for this Stripe session");
  return stripe().refunds.create({ payment_intent: paymentIntent, ...(amount ? { amount } : {}) });
}
