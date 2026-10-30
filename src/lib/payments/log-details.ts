// Turns Stripe objects and errors into short log lines and small JSON snapshots for the payment log.
// No server or database dependencies, so it can be unit-tested (log-details.test.ts).
// Only selected fields are kept: never card details, never the customer's name or address.
import type Stripe from "stripe";

export type LogData = Record<string, unknown>;

/** Every event written to the payment log (src/lib/payments/log.ts), with how staff see it. */
export const PAYMENT_EVENT_LABELS: Record<string, string> = {
  "checkout.started": "Payment started",
  "checkout.resumed": "Payment page reopened",
  "checkout.cancelled": "Customer left the payment page",
  "checkout.start_failed": "Payment could not start",
  "checkout.retry_failed": "Retry could not replace the open payment",
  "checkout.already_paid": "Second payment prevented",
  "checkout.still_processing": "Retry while bank payment in progress",
  "session.closed": "Payment page closed",
  "session.already_completed": "Already paid when closing",
  "session.close_failed": "Could not close the payment page",
  "session.unmatched": "Session matches no order",
  "session.mismatch": "Session of another payment",
  "payment.paid": "Paid",
  "payment.pending": "Bank payment submitted",
  "payment.open": "Not paid yet",
  "payment.failed": "Bank payment failed",
  "payment.expired": "Payment page expired",
  "payment.declined": "Payment attempt declined",
  "payment.amount_mismatch": "Amount does not match",
  "refund.created": "Refund sent",
  "refund.failed": "Refund failed",
  "refund.recorded": "Refund recorded",
  "dispute.created": "Dispute opened",
  "webhook.not_configured": "Webhook not configured",
  "webhook.missing_signature": "Webhook without signature",
  "webhook.invalid_signature": "Webhook signature rejected",
  "webhook.failed": "Webhook processing failed",
  "verify.skipped": "Check skipped",
  "verify.failed": "Check with provider failed",
  "reconcile.failed": "Automatic check failed",
};

/** The fields Stripe reports for a failed payment attempt (PaymentIntent.last_payment_error). */
type PaymentErrorLike = {
  type?: string;
  code?: string;
  decline_code?: string;
  message?: string;
  payment_method?: { type?: string } | null;
  payment_method_type?: string;
  advice_code?: string;
  network_decline_code?: string;
};

/** Drop empty fields, so stored snapshots only show what Stripe actually reported. */
function compact(data: LogData): LogData {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null));
}

function field(err: unknown, key: string): unknown {
  return typeof err === "object" && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

/** stripe-node errors carry a type such as StripeCardError or StripeInvalidRequestError. */
function isStripeError(err: unknown): boolean {
  const type = field(err, "type");
  return typeof type === "string" && type.startsWith("Stripe");
}

function codesOf(code: unknown, declineCode: unknown): string {
  const codes = [code, declineCode].filter((c): c is string => typeof c === "string" && c.length > 0);
  return [...new Set(codes)].join(" / ");
}

/** One line: the message plus Stripe's error and decline codes, e.g. "Your card was declined. [card_declined / generic_decline]". */
export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const codes = isStripeError(err) ? codesOf(field(err, "code"), field(err, "decline_code")) : "";
  return codes ? `${err.message} [${codes}]` : err.message;
}

/** What went wrong in a call. For Stripe errors this includes the request id, to look the call up in the Stripe Dashboard. */
export function errorDetails(err: unknown): LogData {
  if (isStripeError(err)) {
    return compact({
      kind: field(err, "type"),
      message: field(err, "message"),
      code: field(err, "code"),
      decline_code: field(err, "decline_code"),
      param: field(err, "param"),
      statusCode: field(err, "statusCode"),
      requestId: field(err, "requestId"),
      doc_url: field(err, "doc_url"),
    });
  }
  if (err instanceof Error) {
    const code = field(err, "code");
    return compact({ kind: err.name, message: err.message, code: typeof code === "string" ? code : undefined });
  }
  return { message: String(err) };
}

function paymentErrorDetails(error: PaymentErrorLike | null | undefined): LogData | undefined {
  if (!error) return undefined;
  return compact({
    type: error.type,
    code: error.code,
    decline_code: error.decline_code,
    advice_code: error.advice_code,
    network_decline_code: error.network_decline_code,
    message: error.message,
    payment_method_type: error.payment_method?.type ?? error.payment_method_type,
  });
}

/** Why a payment attempt failed, in one line, e.g. "Your card was declined. [card_declined / generic_decline] (card)". */
export function describePaymentError(error: PaymentErrorLike | null | undefined): string {
  if (!error) return "no reason given by Stripe";
  const codes = codesOf(error.code, error.decline_code);
  const method = error.payment_method?.type ?? error.payment_method_type;
  return [error.message ?? "Payment failed", codes && `[${codes}]`, method && `(${method})`].filter(Boolean).join(" ");
}

export function sessionDetails(session: Stripe.Checkout.Session): LogData {
  const pi = session.payment_intent;
  const intent = typeof pi === "object" && pi !== null ? pi : null;
  return compact({
    session: session.id,
    status: session.status,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    currency: session.currency,
    expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
    livemode: session.livemode,
    payment_intent: typeof pi === "string" ? pi : intent?.id,
    payment_intent_status: intent?.status,
    last_payment_error: paymentErrorDetails(intent?.last_payment_error as PaymentErrorLike | null | undefined),
  });
}

export function paymentIntentDetails(pi: Stripe.PaymentIntent): LogData {
  return compact({
    payment_intent: pi.id,
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    livemode: pi.livemode,
    last_payment_error: paymentErrorDetails(pi.last_payment_error as PaymentErrorLike | null | undefined),
  });
}

export function refundDetails(refund: Stripe.Refund): LogData {
  const pi = refund.payment_intent;
  return compact({
    refund: refund.id,
    status: refund.status,
    amount: refund.amount,
    currency: refund.currency,
    failure_reason: refund.failure_reason,
    reason: refund.reason,
    payment_intent: typeof pi === "string" ? pi : pi?.id,
  });
}
