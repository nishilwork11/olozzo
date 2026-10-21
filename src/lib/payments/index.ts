import "server-only";
import type { Order, Store } from "@prisma/client";
import { db } from "../db";
import { markOrderPaid, markPaymentFailed } from "../orders";
import { createMolliePayment, getMolliePayment, mollieEnabled, refundMollie } from "./mollie";
import { createStripeCheckout, isStripeSessionPaid, refundStripe, stripeEnabled } from "./stripe";

export type ProviderId = "stripe" | "mollie" | "demo";

export type PaymentOption = { id: ProviderId; label: string; description: string };

export function demoPaymentsEnabled(): boolean {
  if (process.env.ENABLE_DEMO_PAYMENTS === "true") return true;
  if (process.env.ENABLE_DEMO_PAYMENTS === "false") return false;
  return !stripeEnabled() && !mollieEnabled() && process.env.NODE_ENV !== "production";
}

export function paymentOptions(): PaymentOption[] {
  const options: PaymentOption[] = [];
  if (stripeEnabled()) {
    options.push({
      id: "stripe",
      label: "Card, Apple Pay, SEPA, iDEAL, Bancontact, Klarna",
      description: "Secure payment powered by Stripe",
    });
  }
  if (mollieEnabled()) {
    options.push({
      id: "mollie",
      label: "iDEAL, Bancontact, SOFORT, EPS, PayPal, cards",
      description: "Secure payment powered by Mollie",
    });
  }
  if (demoPaymentsEnabled()) {
    options.push({
      id: "demo",
      label: "Demo payment (test mode)",
      description: "Simulates a successful payment — no money is moved",
    });
  }
  return options;
}

export function isProviderAvailable(id: string): id is ProviderId {
  return paymentOptions().some((o) => o.id === id);
}

/** Start a payment and return the URL the customer must be sent to. */
export async function startPayment(order: Order, store: Store, provider: ProviderId, baseUrl: string, itemCount: number) {
  const orderUrl = `${baseUrl}/s/${store.slug}/order/${order.id}`;
  switch (provider) {
    case "stripe": {
      const session = await createStripeCheckout(order, {
        storeName: store.name,
        storeSlug: store.slug,
        itemCount,
        baseUrl,
      });
      await db.order.update({ where: { id: order.id }, data: { paymentRef: session.id } });
      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return session.url;
    }
    case "mollie": {
      const payment = await createMolliePayment(order, { storeSlug: store.slug, baseUrl });
      await db.order.update({ where: { id: order.id }, data: { paymentRef: payment.id } });
      const href = payment._links.checkout?.href;
      if (!href) throw new Error("Mollie did not return a checkout URL");
      return href;
    }
    case "demo": {
      await markOrderPaid(order.id, `demo_${Date.now()}`);
      return orderUrl;
    }
  }
}

/**
 * Called when the customer lands back on the order page. Confirms payment directly with the
 * provider, so orders complete even when webhooks are not reachable (e.g. on localhost).
 */
export async function verifyPayment(order: Order, stripeSessionId?: string | null) {
  if (order.paymentStatus !== "UNPAID") return;
  try {
    if (order.paymentProvider === "stripe" && stripeEnabled()) {
      const sessionId = stripeSessionId || order.paymentRef;
      if (sessionId && (await isStripeSessionPaid(sessionId, order.id))) await markOrderPaid(order.id, sessionId);
    } else if (order.paymentProvider === "mollie" && mollieEnabled() && order.paymentRef) {
      const payment = await getMolliePayment(order.paymentRef);
      if (payment.status === "paid") await markOrderPaid(order.id, payment.id);
      else if (["canceled", "expired", "failed"].includes(payment.status)) await markPaymentFailed(order.id, `Mollie: ${payment.status}`);
    }
  } catch (err) {
    console.error("[payments] verification failed", err);
  }
}

/** Refund (fully or partially) through the provider that took the payment. */
export async function refundPayment(order: Order, amount = order.total) {
  if (order.paymentStatus !== "PAID") throw new Error("Only paid orders can be refunded");
  if (order.paymentProvider === "stripe") {
    if (!order.paymentRef) throw new Error("Missing Stripe reference");
    await refundStripe(order.paymentRef, amount);
  } else if (order.paymentProvider === "mollie") {
    if (!order.paymentRef) throw new Error("Missing Mollie reference");
    await refundMollie(order.paymentRef, amount);
  }
  // demo payments: nothing to call
}
