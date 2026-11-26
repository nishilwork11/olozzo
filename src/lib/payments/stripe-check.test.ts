import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import { checkStripePayment, describePaymentMethod, stripePaymentOf, type OrderPaymentRecord, type StripePayment } from "./stripe-check";

function intent(fields: Record<string, unknown> = {}): Stripe.PaymentIntent {
  return {
    id: "pi_1",
    object: "payment_intent",
    status: "succeeded",
    amount: 4999,
    amount_received: 4999,
    currency: "eur",
    created: 1_800_000_000,
    livemode: false,
    metadata: { orderId: "ord_1", orderNumber: "OLZ-1" },
    last_payment_error: null,
    latest_charge: null,
    ...fields,
  } as unknown as Stripe.PaymentIntent;
}

function charge(fields: Record<string, unknown> = {}): Stripe.Charge {
  return {
    id: "ch_1",
    object: "charge",
    created: 1_800_000_060,
    amount_refunded: 0,
    disputed: false,
    receipt_url: "https://pay.stripe.com/receipts/x",
    outcome: { risk_level: "normal", seller_message: "Payment complete.", type: "authorized" },
    payment_method_details: { type: "card", card: { brand: "visa", last4: "4242", wallet: null } },
    ...fields,
  } as unknown as Stripe.Charge;
}

const paidOrder: OrderPaymentRecord = { id: "ord_1", total: 4999, currency: "EUR", paymentStatus: "PAID", paymentIntentId: "pi_1" };

function payment(fields: Partial<StripePayment> = {}): StripePayment {
  return { ...stripePaymentOf(intent({ latest_charge: charge() })), ...fields };
}

describe("stripePaymentOf", () => {
  it("reads the payment and its charge: method, refunds, dispute, risk check and receipt", () => {
    const p = stripePaymentOf(
      intent({ latest_charge: charge({ amount_refunded: 1000, disputed: true, payment_method_details: { type: "card", card: { brand: "mastercard", last4: "4444", wallet: { type: "apple_pay" } } } }) }),
    );
    assert.equal(p.id, "pi_1");
    assert.equal(p.currency, "EUR");
    assert.equal(p.orderId, "ord_1");
    assert.equal(p.orderNumber, "OLZ-1");
    assert.equal(p.createdAt.toISOString(), new Date(1_800_000_000_000).toISOString());
    assert.deepEqual(p.charge, {
      id: "ch_1",
      method: "Mastercard •••• 4444 (Apple Pay)",
      paidAt: new Date(1_800_000_060_000),
      refunded: 1000,
      disputed: true,
      risk: "normal",
      riskMessage: "Payment complete.",
      receiptUrl: "https://pay.stripe.com/receipts/x",
    });
  });
  it("has no charge details when the charge was not loaded", () => {
    assert.equal(stripePaymentOf(intent({ latest_charge: "ch_1" })).charge, null);
  });
  it("says why the last attempt failed", () => {
    const p = stripePaymentOf(
      intent({ status: "requires_payment_method", amount_received: 0, last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." } }),
    );
    assert.equal(p.lastError, "Your card has insufficient funds. [card_declined / insufficient_funds]");
  });
});

describe("describePaymentMethod", () => {
  it("names cards by brand and last four digits", () => {
    assert.equal(describePaymentMethod({ type: "card", card: { brand: "visa", last4: "4242", wallet: { type: "google_pay" } } } as Stripe.Charge.PaymentMethodDetails), "Visa •••• 4242 (Google Pay)");
  });
  it("names bank methods with the account's last digits or the bank", () => {
    assert.equal(describePaymentMethod({ type: "sepa_debit", sepa_debit: { last4: "3000" } } as Stripe.Charge.PaymentMethodDetails), "SEPA Direct Debit •••• 3000");
    assert.equal(describePaymentMethod({ type: "ideal", ideal: { bank: "ing" } } as Stripe.Charge.PaymentMethodDetails), "iDEAL (ing)");
  });
  it("falls back to Stripe's method type", () => {
    assert.equal(describePaymentMethod({ type: "revolut_pay", revolut_pay: {} } as unknown as Stripe.Charge.PaymentMethodDetails), "revolut pay");
    assert.equal(describePaymentMethod(null), null);
  });
});

describe("checkStripePayment", () => {
  it("passes a paid order whose Stripe payment received the full total", () => {
    assert.deepEqual(checkStripePayment(paidOrder, payment()), { state: "ok", notes: [] });
  });
  it("flags money received in Stripe for an order that is not paid in olozzo", () => {
    const result = checkStripePayment({ ...paidOrder, paymentStatus: "UNPAID", paymentIntentId: null }, payment());
    assert.equal(result.state, "problem");
    assert.deepEqual(result.notes, ["Stripe received the money, but the order is unpaid"]);
  });
  it("flags a different amount", () => {
    assert.deepEqual(checkStripePayment(paidOrder, payment({ amountReceived: 4000 })).notes, ["Stripe received €40.00, the order total is €49.99"]);
  });
  it("flags an order marked paid whose payment Stripe never completed", () => {
    const result = checkStripePayment(paidOrder, payment({ status: "requires_payment_method", amountReceived: 0, charge: null }));
    assert.deepEqual(result.notes, ["The order is marked paid, but Stripe says this payment is not paid"]);
  });
  it("expects a processing bank payment to be pending in olozzo", () => {
    const processing = payment({ status: "processing", amountReceived: 0, charge: null });
    assert.equal(checkStripePayment({ ...paidOrder, paymentStatus: "PENDING" }, processing).state, "ok");
    assert.deepEqual(checkStripePayment({ ...paidOrder, paymentStatus: "UNPAID" }, processing).notes, [
      "Stripe is processing a bank payment, but the order is unpaid",
    ]);
  });
  it("compares refunds: a full refund must close the order, a refunded order must have a refund, partial refunds are fine", () => {
    const fullyRefunded = payment({ charge: { ...payment().charge!, refunded: 4999 } });
    assert.deepEqual(checkStripePayment(paidOrder, fullyRefunded).notes, ["Fully refunded in Stripe, but the order is not marked refunded"]);
    assert.equal(checkStripePayment({ ...paidOrder, paymentStatus: "REFUNDED" }, fullyRefunded).state, "ok");
    assert.deepEqual(checkStripePayment({ ...paidOrder, paymentStatus: "REFUNDED" }, payment()).notes, ["The order is marked refunded, but Stripe shows no refund"]);
    assert.equal(checkStripePayment(paidOrder, payment({ charge: { ...payment().charge!, refunded: 1000 } })).state, "ok");
  });
  it("shows an earlier failed attempt of a paid order as a note, and a second successful payment as a problem", () => {
    const otherAttempt = payment({ id: "pi_2", status: "requires_payment_method", amountReceived: 0, charge: null });
    assert.deepEqual(checkStripePayment(paidOrder, otherAttempt), { state: "other", notes: ["Earlier attempt: the order is linked to payment pi_1"] });
    assert.deepEqual(checkStripePayment(paidOrder, payment({ id: "pi_2" })).notes, [
      "Paid twice: the order is linked to payment pi_1. Refund one of the two payments in Stripe",
    ]);
  });
  it("flags a dispute", () => {
    assert.deepEqual(checkStripePayment(paidOrder, payment({ charge: { ...payment().charge!, disputed: true } })).notes, [
      "The customer disputed this payment: respond in the Stripe Dashboard",
    ]);
  });
  it("flags a payment whose order id points at another order", () => {
    assert.deepEqual(checkStripePayment(paidOrder, payment({ orderId: "ord_9" })).notes, ["This Stripe payment belongs to another order (ord_9)"]);
  });
  it("without an order: flags money for an order that does not exist, ignores payments not made by olozzo", () => {
    assert.deepEqual(checkStripePayment(null, payment()), {
      state: "problem",
      notes: ["Stripe received the money for order OLZ-1, but that order does not exist in olozzo"],
    });
    assert.deepEqual(checkStripePayment(null, payment({ status: "canceled", amountReceived: 0 })), { state: "other", notes: ["Order OLZ-1 no longer exists"] });
    assert.deepEqual(checkStripePayment(null, payment({ orderId: null })), { state: "other", notes: ["Not an olozzo order (no order id in the payment)"] });
  });
});
