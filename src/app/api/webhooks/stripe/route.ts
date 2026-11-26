import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { paymentLog } from "@/lib/payments/log";
import { errorDetails, errorMessage } from "@/lib/payments/log-details";
import { handleStripeEvent, orderIdOfEvent } from "@/lib/payments/stripe-events";
import { stripe, stripeEnabled } from "@/lib/payments/stripe";

// Configure in Stripe Dashboard → Workbench → Webhooks, endpoint: https://<your-domain>/api/webhooks/stripe
// Events: see STRIPE_WEBHOOK_EVENTS in src/lib/payments/stripe-events.ts
// Local testing: stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,payment_intent.payment_failed,charge.refunded,refund.failed,charge.dispute.created --forward-to localhost:3000/api/webhooks/stripe
//
// Every refusal and failure is written to the payment log (admin → Payments → Payment log). Refusals anyone could
// trigger by calling this URL are stored at most once a minute.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeEnabled() || !secret) {
    await paymentLog({
      level: "ERROR",
      event: "webhook.not_configured",
      message: `Webhook refused: ${stripeEnabled() ? "STRIPE_WEBHOOK_SECRET" : "STRIPE_SECRET_KEY"} is not set on the server. Stripe retries the delivery; set the variable and restart`,
      throttleSeconds: 60,
    });
    return NextResponse.json({ error: "Stripe webhooks not configured" }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    await paymentLog({
      level: "WARN",
      event: "webhook.missing_signature",
      message: "Request without a Stripe-Signature header refused (not sent by Stripe)",
      throttleSeconds: 60,
    });
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // The signature covers the raw body, so it must be read as text, never re-serialised JSON
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    await paymentLog({
      level: "ERROR",
      event: "webhook.invalid_signature",
      message: `Webhook refused: ${errorMessage(err)}. Usually STRIPE_WEBHOOK_SECRET belongs to another endpoint or mode (test/live)`,
      data: errorDetails(err),
      throttleSeconds: 60,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // A non-2xx answer makes Stripe retry (for up to 3 days in live mode); every handler is idempotent
    await paymentLog({
      orderId: orderIdOfEvent(event),
      level: "ERROR",
      event: "webhook.failed",
      ref: event.id,
      message: `Could not process ${event.type}: ${errorMessage(err)}. Stripe will retry the delivery`,
      data: { event: event.id, event_type: event.type, ...errorDetails(err) },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
