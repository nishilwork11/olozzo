// Payment rules with no server or database dependencies, so they can be unit-tested (rules.test.ts).

/** How long a customer has to finish paying. Also how long their items stay reserved. Stripe allows 30 min–24 h. */
export const PAYMENT_WINDOW_MINUTES = 60;

/** Payment states in which the order still holds its stock and the customer should not be asked to pay again. */
export const OPEN_PAYMENT_STATUSES = ["UNPAID", "PENDING"] as const;

export type StripeMode = "live" | "test";

/** Live or test, read from the key prefix (sk_live_, rk_live_, sk_test_, rk_test_). */
export function stripeKeyMode(key: string | undefined | null): StripeMode | null {
  if (!key) return null;
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return null;
}

type DemoEnv = { NODE_ENV?: string; ENABLE_DEMO_PAYMENTS?: string; STRIPE_SECRET_KEY?: string };

/**
 * Demo payments mark an order paid without moving money, so they are never offered in production builds
 * or next to a live Stripe key, whatever ENABLE_DEMO_PAYMENTS says. Locally they default to on only when
 * no real provider is configured.
 */
export function demoPaymentsAllowed(env: DemoEnv, realProviderConfigured: boolean): boolean {
  if (env.NODE_ENV === "production") return false;
  if (stripeKeyMode(env.STRIPE_SECRET_KEY) === "live") return false;
  if (env.ENABLE_DEMO_PAYMENTS === "true") return true;
  if (env.ENABLE_DEMO_PAYMENTS === "false") return false;
  return !realProviderConfigured;
}

/** Link to a payment in the Stripe Dashboard (test or live). */
export function stripePaymentUrl(mode: StripeMode | null, paymentIntentId: string): string {
  return `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}payments/${encodeURIComponent(paymentIntentId)}`;
}

/** One-line description of the order for the Stripe payment page, e.g. "2 × Desk lamp, Cable (Black)". */
export function checkoutSummary(items: { title: string; variantName: string; quantity: number }[], maxLength = 250): string {
  const text = items
    .map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.title}${i.variantName && i.variantName !== "Default" ? ` (${i.variantName})` : ""}`)
    .join(", ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export type CheckoutSnapshot = {
  total: number;
  paymentProvider: string;
  discountCode: string | null;
  email: string;
  name: string;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postalCode: string;
  country: string;
  items: { variantId: string | null; quantity: number; unitPrice: number }[];
};

/**
 * True when a retried checkout asks for exactly what an open order already holds, so the customer can be
 * sent back to the same payment page instead of getting a second order.
 */
export function sameCheckout(a: CheckoutSnapshot, b: CheckoutSnapshot): boolean {
  const scalar: (keyof Omit<CheckoutSnapshot, "items">)[] = [
    "total",
    "paymentProvider",
    "discountCode",
    "email",
    "name",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "postalCode",
    "country",
  ];
  if (scalar.some((k) => (a[k] ?? null) !== (b[k] ?? null))) return false;
  const key = (items: CheckoutSnapshot["items"]) =>
    items
      .map((i) => `${i.variantId}:${i.quantity}:${i.unitPrice}`)
      .sort()
      .join("|");
  return key(a.items) === key(b.items);
}
