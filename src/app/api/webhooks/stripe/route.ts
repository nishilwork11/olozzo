import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { markOrderPaid, markPaymentFailed } from "@/lib/orders";
import { stripe, stripeEnabled } from "@/lib/payments/stripe";

// Configure in Stripe Dashboard → Developers → Webhooks, endpoint: https://<your-domain>/api/webhooks/stripe
// Events: checkout.session.completed, checkout.session.async_payment_succeeded,
//         checkout.session.async_payment_failed, checkout.session.expired
// Local testing: stripe listen --forward-to localhost:3000/api/webhooks/stripe
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeEnabled() || !secret) return NextResponse.json({ error: "Stripe webhooks not configured" }, { status: 501 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    console.error("[stripe] invalid webhook signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  if (!orderId) return NextResponse.json({ received: true });

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (session.payment_status === "paid") await markOrderPaid(orderId, session.id);
      break;
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      await markPaymentFailed(orderId, `Stripe: ${event.type}`);
      break;
  }
  return NextResponse.json({ received: true });
}
