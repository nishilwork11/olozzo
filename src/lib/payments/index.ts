import "server-only";
import type { Order, Store } from "@prisma/client";
import { db } from "../db";
import { formatMoney } from "../money";
import { orderPagePath } from "../order-access";
import { cancelUnpaidOrder, markOrderPaid, markOrderRefunded, markPaymentFailed } from "../orders";
import { createMolliePayment, getMolliePayment, mollieEnabled, refundMollie } from "./mollie";
import { demoPaymentsAllowed } from "./rules";
import { applyCheckoutSession } from "./stripe-events";
import { createStripeCheckout, expireStripeSession, getStripeSession, refundStripe, stripeEnabled, stripeMode } from "./stripe";

export type ProviderId = "stripe" | "mollie" | "demo";

export type PaymentOption = { id: ProviderId; label: string; description: string };

export function demoPaymentsEnabled(): boolean {
  return demoPaymentsAllowed(process.env, stripeEnabled() || mollieEnabled());
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
export async function startPayment(
  order: Order,
  store: Store,
  provider: ProviderId,
  opts: { baseUrl: string; accessToken: string; summary: string },
) {
  const orderUrl = `${opts.baseUrl}${orderPagePath(store.slug, order.id, opts.accessToken)}`;
  switch (provider) {
    case "stripe": {
      const session = await createStripeCheckout(order, {
        storeName: store.name,
        summary: opts.summary,
        // Stripe fills in {CHECKOUT_SESSION_ID}; the order page confirms that session before rendering
        successUrl: `${orderUrl}${orderUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${opts.baseUrl}/s/${store.slug}/checkout?cancelled=1`,
      });
      await db.order.update({ where: { id: order.id }, data: { paymentRef: session.id } });
      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return session.url;
    }
    case "mollie": {
      const payment = await createMolliePayment(order, { redirectUrl: orderUrl, baseUrl: opts.baseUrl });
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
 * Where an open order's payment page is, if the customer can still use it (same checkout retried).
 * "complete" = the customer already paid or submitted it.
 */
export async function resumablePaymentUrl(order: Order): Promise<string | "complete" | null> {
  if (order.paymentProvider !== "stripe" || !order.paymentRef || !stripeEnabled()) return null;
  // Leave a few minutes to pay; otherwise start a fresh session
  if (!order.paymentExpiresAt || order.paymentExpiresAt.getTime() - Date.now() < 5 * 60_000) return null;
  const session = await getStripeSession(order.paymentRef);
  if (session.status === "complete") return "complete";
  return session.status === "open" ? session.url : null;
}

/**
 * Close an unpaid order's payment so it can't be paid any more, then cancel the order.
 * Returns "paid" when the customer completed the payment in the meantime (the order is then synced instead).
 */
export async function retireUnpaidOrder(order: Order, reason: string, userId: string | null = null): Promise<"cancelled" | "paid"> {
  if (order.paymentProvider === "stripe" && order.paymentRef && stripeEnabled()) {
    if ((await expireStripeSession(order.paymentRef)) === "complete") {
      await applyCheckoutSession(await getStripeSession(order.paymentRef));
      return "paid";
    }
  }
  // Mollie payments cannot be closed from here; if one is still paid later, markOrderPaid honours it
  await cancelUnpaidOrder(order.id, reason, userId);
  return "cancelled";
}

/**
 * Called when the customer lands back on the order page. Confirms payment directly with the
 * provider, so orders complete even when webhooks are late or not reachable (e.g. on localhost).
 * The payment reference stored on the order wins; the Checkout Session id from the return URL is only
 * used when none was stored, and only if Stripe says that session belongs to this order.
 */
export async function verifyPayment(order: Order, returnedSessionId?: string | null) {
  if (order.paymentStatus !== "UNPAID" && order.paymentStatus !== "PENDING") return;
  try {
    const sessionId = order.paymentRef ?? (returnedSessionId?.startsWith("cs_") ? returnedSessionId : null);
    if (order.paymentProvider === "stripe" && stripeEnabled() && sessionId) {
      const session = await getStripeSession(sessionId);
      if (session.metadata?.orderId === order.id) await applyCheckoutSession(session);
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
    await refundStripe(order, amount);
  } else if (order.paymentProvider === "mollie") {
    if (!order.paymentRef) throw new Error("Missing Mollie reference");
    await refundMollie(order.paymentRef, amount);
  }
  // demo payments: nothing to call
}

/**
 * Refund the whole order and close it. The provider is called first: if that fails nothing changes here.
 * If our database update fails after a Stripe refund, the charge.refunded webhook closes the order instead.
 */
export async function refundOrderInFull(order: Order, userId: string) {
  await refundPayment(order);
  await markOrderRefunded(order.id, `${order.number} refunded ${formatMoney(order.total)} via ${order.paymentProvider}`, userId);
}

/** What the admin Payments page reports about the configuration (never the secrets themselves). */
export function paymentSetup() {
  return {
    stripe: stripeEnabled(),
    stripeMode: stripeMode(),
    stripeRestrictedKey: /^rk_/.test(process.env.STRIPE_SECRET_KEY ?? ""),
    stripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    mollie: mollieEnabled(),
    demo: demoPaymentsEnabled(),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
  };
}
