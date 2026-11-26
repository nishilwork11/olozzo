import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import { describePaymentError, errorDetails, errorMessage, paymentIntentDetails, refundDetails, sessionDetails } from "./log-details";

// The shape stripe-node gives its errors (StripeCardError, StripeInvalidRequestError…)
function stripeError(fields: Record<string, unknown>) {
  return Object.assign(new Error(String(fields.message ?? "")), fields);
}

describe("errorMessage", () => {
  it("adds Stripe's error and decline codes to the message", () => {
    const err = stripeError({ type: "StripeCardError", message: "Your card has insufficient funds.", code: "card_declined", decline_code: "insufficient_funds" });
    assert.equal(errorMessage(err), "Your card has insufficient funds. [card_declined / insufficient_funds]");
  });
  it("uses the plain message of any other error", () => {
    assert.equal(errorMessage(new Error("Connection refused")), "Connection refused");
    assert.equal(errorMessage("timeout"), "timeout");
  });
});

describe("errorDetails", () => {
  it("keeps what is needed to look a Stripe error up (request id, status, codes) and drops empty fields", () => {
    const err = stripeError({
      type: "StripePermissionError",
      message: "The provided key does not have the required permissions",
      statusCode: 403,
      requestId: "req_123",
      code: undefined,
    });
    assert.deepEqual(errorDetails(err), {
      kind: "StripePermissionError",
      message: "The provided key does not have the required permissions",
      statusCode: 403,
      requestId: "req_123",
    });
  });
  it("records the name, message and code of other errors", () => {
    const err = Object.assign(new Error("Unique constraint failed"), { name: "PrismaClientKnownRequestError", code: "P2002" });
    assert.deepEqual(errorDetails(err), { kind: "PrismaClientKnownRequestError", message: "Unique constraint failed", code: "P2002" });
    assert.deepEqual(errorDetails(42), { message: "42" });
  });
});

describe("describePaymentError", () => {
  it("explains a declined attempt with its codes and payment method", () => {
    assert.equal(
      describePaymentError({ message: "Your card was declined.", code: "card_declined", decline_code: "generic_decline", payment_method_type: "card" }),
      "Your card was declined. [card_declined / generic_decline] (card)",
    );
  });
  it("does not repeat a decline code equal to the error code", () => {
    assert.equal(describePaymentError({ message: "Expired card.", code: "expired_card", decline_code: "expired_card" }), "Expired card. [expired_card]");
  });
  it("says so when Stripe gave no reason", () => {
    assert.equal(describePaymentError(null), "no reason given by Stripe");
  });
});

describe("sessionDetails", () => {
  it("keeps the session's state and its PaymentIntent's failure, never the customer's details", () => {
    const session = {
      id: "cs_test_1",
      status: "complete",
      payment_status: "unpaid",
      amount_total: 2599,
      currency: "eur",
      expires_at: 1_800_000_000,
      livemode: false,
      customer_email: "jane@example.com",
      customer_details: { email: "jane@example.com", address: { line1: "Main St 1" } },
      payment_intent: {
        id: "pi_1",
        status: "requires_payment_method",
        last_payment_error: { type: "invalid_request_error", code: "payment_method_not_available", message: "Mandate revoked", payment_method: { type: "sepa_debit" } },
      },
    } as unknown as Stripe.Checkout.Session;

    assert.deepEqual(sessionDetails(session), {
      session: "cs_test_1",
      status: "complete",
      payment_status: "unpaid",
      amount_total: 2599,
      currency: "eur",
      expires_at: new Date(1_800_000_000_000).toISOString(),
      livemode: false,
      payment_intent: "pi_1",
      payment_intent_status: "requires_payment_method",
      last_payment_error: { type: "invalid_request_error", code: "payment_method_not_available", message: "Mandate revoked", payment_method_type: "sepa_debit" },
    });
  });
  it("handles a session whose PaymentIntent is not expanded or not created yet", () => {
    const base = { id: "cs_2", status: "open", payment_status: "unpaid", amount_total: 100, currency: "eur", expires_at: null, livemode: true };
    assert.equal(sessionDetails({ ...base, payment_intent: "pi_2" } as unknown as Stripe.Checkout.Session).payment_intent, "pi_2");
    assert.equal("payment_intent" in sessionDetails({ ...base, payment_intent: null } as unknown as Stripe.Checkout.Session), false);
  });
});

describe("paymentIntentDetails", () => {
  it("keeps the amount, status and why the last attempt failed", () => {
    const pi = {
      id: "pi_3",
      status: "requires_payment_method",
      amount: 4999,
      currency: "eur",
      livemode: true,
      last_payment_error: { code: "card_declined", decline_code: "stolen_card", message: "Your card was declined.", payment_method: { type: "card" } },
    } as unknown as Stripe.PaymentIntent;
    assert.deepEqual(paymentIntentDetails(pi), {
      payment_intent: "pi_3",
      status: "requires_payment_method",
      amount: 4999,
      currency: "eur",
      livemode: true,
      last_payment_error: { code: "card_declined", decline_code: "stolen_card", message: "Your card was declined.", payment_method_type: "card" },
    });
  });
});

describe("refundDetails", () => {
  it("keeps the refund's status and failure reason", () => {
    const refund = { id: "re_1", status: "failed", amount: 1500, currency: "eur", failure_reason: "expired_or_canceled_card", payment_intent: "pi_4", reason: null } as unknown as Stripe.Refund;
    assert.deepEqual(refundDetails(refund), {
      refund: "re_1",
      status: "failed",
      amount: 1500,
      currency: "eur",
      failure_reason: "expired_or_canceled_card",
      payment_intent: "pi_4",
    });
  });
});
