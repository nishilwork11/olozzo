import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkoutSummary, demoPaymentsAllowed, sameCheckout, stripeKeyMode, stripePaymentUrl, type CheckoutSnapshot } from "./rules";

describe("stripeKeyMode", () => {
  it("reads live and test from secret and restricted keys", () => {
    assert.equal(stripeKeyMode("sk_live_abc"), "live");
    assert.equal(stripeKeyMode("rk_live_abc"), "live");
    assert.equal(stripeKeyMode("sk_test_abc"), "test");
    assert.equal(stripeKeyMode("rk_test_abc"), "test");
    assert.equal(stripeKeyMode(""), null);
    assert.equal(stripeKeyMode(undefined), null);
    assert.equal(stripeKeyMode("pk_live_abc"), null);
  });
});

describe("demoPaymentsAllowed", () => {
  it("is never allowed in a production build, even when switched on", () => {
    assert.equal(demoPaymentsAllowed({ NODE_ENV: "production", ENABLE_DEMO_PAYMENTS: "true" }, false), false);
  });
  it("is never allowed next to a live Stripe key", () => {
    assert.equal(demoPaymentsAllowed({ NODE_ENV: "development", ENABLE_DEMO_PAYMENTS: "true", STRIPE_SECRET_KEY: "rk_live_x" }, true), false);
  });
  it("follows ENABLE_DEMO_PAYMENTS in development", () => {
    assert.equal(demoPaymentsAllowed({ NODE_ENV: "development", ENABLE_DEMO_PAYMENTS: "true", STRIPE_SECRET_KEY: "sk_test_x" }, true), true);
    assert.equal(demoPaymentsAllowed({ NODE_ENV: "development", ENABLE_DEMO_PAYMENTS: "false" }, false), false);
  });
  it("defaults to on locally only when no real provider is configured", () => {
    assert.equal(demoPaymentsAllowed({ NODE_ENV: "development" }, false), true);
    assert.equal(demoPaymentsAllowed({ NODE_ENV: "development" }, true), false);
  });
});

describe("stripePaymentUrl", () => {
  it("links to the test or live dashboard", () => {
    assert.equal(stripePaymentUrl("test", "pi_1"), "https://dashboard.stripe.com/test/payments/pi_1");
    assert.equal(stripePaymentUrl("live", "pi_1"), "https://dashboard.stripe.com/payments/pi_1");
  });
});

describe("checkoutSummary", () => {
  it("lists quantities and options, skipping the default option", () => {
    assert.equal(
      checkoutSummary([
        { title: "Desk lamp", variantName: "Default", quantity: 2 },
        { title: "Cable", variantName: "Black", quantity: 1 },
      ]),
      "2 × Desk lamp, Cable (Black)",
    );
  });
  it("is cut to the maximum length", () => {
    const text = checkoutSummary([{ title: "x".repeat(400), variantName: "Default", quantity: 1 }], 50);
    assert.equal(text.length, 50);
    assert.ok(text.endsWith("…"));
  });
});

describe("sameCheckout", () => {
  const base: CheckoutSnapshot = {
    total: 4990,
    paymentProvider: "stripe",
    discountCode: null,
    email: "a@example.com",
    name: "Ana Example",
    phone: null,
    addressLine1: "Main 1",
    addressLine2: null,
    city: "Berlin",
    postalCode: "10115",
    country: "DE",
    items: [
      { variantId: "v1", quantity: 1, unitPrice: 2990 },
      { variantId: "v2", quantity: 2, unitPrice: 1000 },
    ],
  };

  it("matches the same cart regardless of line order", () => {
    assert.equal(sameCheckout(base, { ...base, items: [...base.items].reverse() }), true);
  });
  it("treats missing optional fields as empty", () => {
    assert.equal(sameCheckout(base, { ...base, phone: undefined as unknown as null }), true);
  });
  it("differs when the cart, total, address or provider changes", () => {
    assert.equal(sameCheckout(base, { ...base, items: [{ variantId: "v1", quantity: 2, unitPrice: 2990 }] }), false);
    assert.equal(sameCheckout(base, { ...base, total: 4991 }), false);
    assert.equal(sameCheckout(base, { ...base, city: "Munich" }), false);
    assert.equal(sameCheckout(base, { ...base, paymentProvider: "mollie" }), false);
  });
});
