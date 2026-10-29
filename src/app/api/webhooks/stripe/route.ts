import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { handleStripeEvent } from "@/lib/payments/stripe-events";
import { stripe, stripeEnabled } from "@/lib/payments/stripe";

// Configure in Stripe Dashboard → Workbench → Webhooks, endpoint: https://<your-domain>/api/webhooks/stripe
// Events: see STRIPE_WEBHOOK_EVENTS in src/lib/payments/stripe-events.ts
// Local testing: stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded,charge.dispute.created --forward-to localhost:3000/api/webhooks/stripe
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeEnabled() || !secret) return NextResponse.json({ error: "Stripe webhooks not configured" }, { status: 501 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    // The signature covers the raw body, so it must be read as text, never re-serialised JSON
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    console.error("[stripe] invalid webhook signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // A non-2xx answer makes Stripe retry (for up to 3 days in live mode); every handler is idempotent
    console.error(`[stripe] failed to process ${event.type} ${event.id}`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
