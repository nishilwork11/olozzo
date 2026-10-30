// Compares what Stripe reports for a payment with what olozzo recorded on the order, for the admin's payment check
// (the Stripe card on the admin order page and /admin/payments/stripe).
// No server or database dependencies, so it can be unit-tested (stripe-check.test.ts).
import type Stripe from "stripe";
import { formatMoney } from "../money";
import { describePaymentError } from "./log-details";

/** One Stripe payment (PaymentIntent), reduced to what staff need to check it. */
export type StripePayment = {
  id: string;
  status: Stripe.PaymentIntent.Status;
  amount: number;
  amountReceived: number;
  currency: string;
  /** Set by olozzo at checkout (src/lib/payments/stripe.ts) */
  orderId: string | null;
  orderNumber: string | null;
  createdAt: Date;
  livemode: boolean;
  /** Why the last attempt failed, e.g. a card decline */
  lastError: string | null;
  /** From the charge. Null when there is none yet, or when the API key may not read charges. */
  charge: {
    id: string;
    method: string | null;
    paidAt: Date;
    refunded: number;
    disputed: boolean;
    risk: string | null;
    riskMessage: string | null;
    receiptUrl: string | null;
  } | null;
};

/** The order fields the check compares. */
export type OrderPaymentRecord = { id: string; total: number; currency: string; paymentStatus: string; paymentIntentId: string | null };

export type PaymentCheck = {
  /** ok: Stripe and olozzo agree. problem: they disagree, or the payment needs action. other: nothing to compare. */
  state: "ok" | "problem" | "other";
  notes: string[];
};

const METHOD_NAMES: Record<string, string> = {
  card: "Card",
  sepa_debit: "SEPA Direct Debit",
  ideal: "iDEAL",
  bancontact: "Bancontact",
  klarna: "Klarna",
  eps: "EPS",
  p24: "Przelewy24",
  paypal: "PayPal",
  link: "Link",
  sofort: "SOFORT",
};
const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  cartes_bancaires: "Cartes Bancaires",
  diners: "Diners Club",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
};
const WALLETS: Record<string, string> = { apple_pay: "Apple Pay", google_pay: "Google Pay", samsung_pay: "Samsung Pay", link: "Link" };

const STATUS_LABELS: Record<Stripe.PaymentIntent.Status, string> = {
  succeeded: "Succeeded",
  processing: "Processing",
  requires_payment_method: "Not paid",
  requires_action: "Waiting for the customer",
  requires_confirmation: "Not submitted",
  requires_capture: "Authorised, not captured",
  canceled: "Canceled",
};

const ORDER_STATES: Record<string, string> = {
  UNPAID: "unpaid",
  PENDING: "waiting for a bank payment",
  PAID: "paid",
  FAILED: "marked failed",
  REFUNDED: "refunded",
};

function words(code: string): string {
  return code.replace(/_/g, " ");
}

export function formatAmount(cents: number, currency: string): string {
  return currency.toUpperCase() === "EUR" ? formatMoney(cents) : `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/** e.g. "Visa •••• 4242 (Apple Pay)", "SEPA Direct Debit •••• 3000", "iDEAL (ing)". */
export function describePaymentMethod(details: Stripe.Charge.PaymentMethodDetails | null | undefined): string | null {
  if (!details) return null;
  type MethodFields = { brand?: string | null; last4?: string | null; bank?: string | null; wallet?: { type?: string } | null };
  const own = (details as unknown as Record<string, MethodFields | undefined>)[details.type];
  const name =
    details.type === "card" && own?.brand ? (CARD_BRANDS[own.brand] ?? words(own.brand)) : (METHOD_NAMES[details.type] ?? words(details.type));
  const wallet = own?.wallet?.type ? (WALLETS[own.wallet.type] ?? words(own.wallet.type)) : null;
  return [name, own?.last4 && `•••• ${own.last4}`, own?.bank && `(${own.bank})`, wallet && `(${wallet})`].filter(Boolean).join(" ");
}

/** "Declined" for a failed attempt, otherwise Stripe's status in words. */
export function stripeStatusLabel(payment: Pick<StripePayment, "status" | "lastError">): string {
  if (payment.status === "requires_payment_method" && payment.lastError) return "Declined";
  return STATUS_LABELS[payment.status] ?? words(payment.status);
}

export function stripePaymentOf(pi: Stripe.PaymentIntent): StripePayment {
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return {
    id: pi.id,
    status: pi.status,
    amount: pi.amount,
    amountReceived: pi.amount_received,
    currency: pi.currency.toUpperCase(),
    orderId: pi.metadata?.orderId || null,
    orderNumber: pi.metadata?.orderNumber || null,
    createdAt: new Date(pi.created * 1000),
    livemode: pi.livemode,
    lastError: pi.last_payment_error ? describePaymentError(pi.last_payment_error as Parameters<typeof describePaymentError>[0]) : null,
    charge: charge && {
      id: charge.id,
      method: describePaymentMethod(charge.payment_method_details),
      paidAt: new Date(charge.created * 1000),
      refunded: charge.amount_refunded,
      disputed: charge.disputed,
      risk: charge.outcome?.risk_level ?? null,
      riskMessage: charge.outcome?.seller_message ?? null,
      receiptUrl: charge.receipt_url,
    },
  };
}

/** Does Stripe agree with the order? `order` is null when no olozzo order matches the payment. */
export function checkStripePayment(order: OrderPaymentRecord | null, payment: StripePayment): PaymentCheck {
  const moneyIn = payment.status === "succeeded" || payment.status === "processing";
  const orderName = payment.orderNumber ?? payment.orderId;
  if (!order) {
    if (!payment.orderId) return { state: "other", notes: ["Not an olozzo order (no order id in the payment)"] };
    if (!moneyIn) return { state: "other", notes: [`Order ${orderName} no longer exists`] };
    const what = payment.status === "succeeded" ? "Stripe received the money" : "Stripe is processing a payment";
    return { state: "problem", notes: [`${what} for order ${orderName}, but that order does not exist in olozzo`] };
  }
  if (payment.orderId && payment.orderId !== order.id) {
    return { state: "problem", notes: [`This Stripe payment belongs to another order (${payment.orderId})`] };
  }
  if (order.paymentIntentId && order.paymentIntentId !== payment.id) {
    if (payment.status === "succeeded") {
      return { state: "problem", notes: [`Paid twice: the order is linked to payment ${order.paymentIntentId}. Refund one of the two payments in Stripe`] };
    }
    if (payment.status === "processing") {
      return { state: "problem", notes: [`A second bank payment is processing: the order is linked to payment ${order.paymentIntentId}. Refund one if both succeed`] };
    }
    return { state: "other", notes: [`Earlier attempt: the order is linked to payment ${order.paymentIntentId}`] };
  }

  const notes: string[] = [];
  const orderState = ORDER_STATES[order.paymentStatus] ?? order.paymentStatus.toLowerCase();
  const recordedPaid = order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED";
  if (payment.currency !== order.currency.toUpperCase()) notes.push(`Currency: Stripe ${payment.currency}, order ${order.currency}`);
  if (payment.status === "succeeded") {
    if (payment.amountReceived !== order.total) {
      notes.push(`Stripe received ${formatAmount(payment.amountReceived, payment.currency)}, the order total is ${formatAmount(order.total, order.currency)}`);
    }
    if (!recordedPaid) notes.push(`Stripe received the money, but the order is ${orderState}`);
  } else if (recordedPaid) {
    notes.push(`The order is marked ${orderState}, but Stripe says this payment is ${stripeStatusLabel(payment).toLowerCase()}`);
  } else if (payment.status === "processing" && order.paymentStatus !== "PENDING") {
    notes.push(`Stripe is processing a bank payment, but the order is ${orderState}`);
  }
  if (payment.charge) {
    const fullyRefunded = payment.amountReceived > 0 && payment.charge.refunded >= payment.amountReceived;
    if (fullyRefunded && order.paymentStatus !== "REFUNDED") notes.push("Fully refunded in Stripe, but the order is not marked refunded");
    if (order.paymentStatus === "REFUNDED" && payment.charge.refunded === 0) notes.push("The order is marked refunded, but Stripe shows no refund");
    if (payment.charge.disputed) notes.push("The customer disputed this payment: respond in the Stripe Dashboard");
  }
  return { state: notes.length > 0 ? "problem" : "ok", notes };
}
