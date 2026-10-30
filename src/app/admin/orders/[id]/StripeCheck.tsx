import type { Order } from "@prisma/client";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { errorMessage } from "@/lib/payments/log-details";
import { stripePaymentUrl } from "@/lib/payments/rules";
import { getStripeOrderPayment, stripeMode } from "@/lib/payments/stripe";
import { checkStripePayment, formatAmount, stripePaymentOf, stripeStatusLabel, type PaymentCheck } from "@/lib/payments/stripe-check";
import { cn, formatDateTime } from "@/lib/utils";

const SESSION_STATES: Record<string, string> = { open: "Open", complete: "Completed", expired: "Expired" };

/** What Stripe says about this order's payment right now, compared with the order. Read live from Stripe on every view. */
export async function StripeCheck({ order }: { order: Order }) {
  let result: Awaited<ReturnType<typeof getStripeOrderPayment>>;
  try {
    result = await getStripeOrderPayment(order);
  } catch (err) {
    return (
      <Card>
        <CardHeader title="Stripe check" />
        <p className="p-5 text-sm text-red-700">Could not reach Stripe: {errorMessage(err)}</p>
      </Card>
    );
  }

  const { session, chargeAccess } = result;
  const payment = result.payment && stripePaymentOf(result.payment);
  const recordedPaid = order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED";
  const check: PaymentCheck | null = payment
    ? checkStripePayment(order, payment)
    : recordedPaid
      ? { state: "problem", notes: [`The order is marked ${order.paymentStatus.toLowerCase()}, but Stripe has no payment for it`] }
      : null;
  const charge = payment?.charge;
  const currency = payment?.currency ?? order.currency;

  return (
    <Card>
      <CardHeader
        title="Stripe check"
        action={
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
              check?.state === "ok"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                : check?.state === "problem"
                  ? "bg-red-50 text-red-700 ring-red-600/20"
                  : "bg-ink-100 text-ink-700 ring-ink-500/20",
            )}
          >
            {check?.state === "ok"
              ? "Matches"
              : check?.state === "problem"
                ? check.notes.length === 1
                  ? "1 problem"
                  : `${check.notes.length} problems`
                : payment
                  ? "Nothing to compare"
                  : "No payment yet"}
          </span>
        }
      />
      <div className="space-y-4 p-5 text-sm">
        {check?.state === "problem" && (
          <ul className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            {check.notes.map((note) => (
              <li key={note} className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
        {check?.state === "ok" && (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>Stripe and olozzo agree on this payment.</span>
          </p>
        )}
        {check?.state === "other" && <p className="text-ink-500">{check.notes.join(". ")}</p>}
        {!payment && !check && <p className="text-ink-500">The customer has not submitted a payment on Stripe&apos;s page yet.</p>}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {payment && (
            <>
              <dt className="text-ink-500">Stripe status</dt>
              <dd className={cn("font-medium", payment.status === "succeeded" ? "text-emerald-700" : payment.lastError ? "text-red-700" : "")}>
                {stripeStatusLabel(payment)}
              </dd>
              <dt className="text-ink-500">Amount</dt>
              <dd className="font-medium">
                {payment.status === "succeeded"
                  ? `${formatAmount(payment.amountReceived, payment.currency)} received`
                  : `${formatAmount(payment.amount, payment.currency)} requested`}
              </dd>
            </>
          )}
          {charge?.method && (
            <>
              <dt className="text-ink-500">Method</dt>
              <dd>{charge.method}</dd>
            </>
          )}
          {charge && payment?.status === "succeeded" && (
            <>
              <dt className="text-ink-500">Charged</dt>
              <dd>{formatDateTime(charge.paidAt)}</dd>
            </>
          )}
          {charge && charge.refunded > 0 && (
            <>
              <dt className="text-ink-500">Refunded</dt>
              <dd>
                {formatAmount(charge.refunded, currency)}
                {charge.refunded < (payment?.amountReceived ?? 0) && " (partial)"}
              </dd>
            </>
          )}
          {charge?.disputed && (
            <>
              <dt className="text-ink-500">Dispute</dt>
              <dd className="font-medium text-red-700">Opened by the customer</dd>
            </>
          )}
          {charge?.risk && (
            <>
              <dt className="text-ink-500">Risk check</dt>
              <dd>
                {charge.risk}
                {charge.riskMessage && <span className="text-ink-500"> · {charge.riskMessage}</span>}
              </dd>
            </>
          )}
          {payment?.lastError && payment.status !== "succeeded" && (
            <>
              <dt className="text-ink-500">Last attempt</dt>
              <dd className="text-red-700">{payment.lastError}</dd>
            </>
          )}
          {session && (
            <>
              <dt className="text-ink-500">Payment page</dt>
              <dd>
                {(session.status && SESSION_STATES[session.status]) ?? session.status ?? "Unknown"}
                {session.status === "open" && session.expires_at && (
                  <span className="text-ink-500"> · until {formatDateTime(new Date(session.expires_at * 1000))}</span>
                )}
              </dd>
            </>
          )}
          {charge?.receiptUrl && (
            <>
              <dt className="text-ink-500">Receipt</dt>
              <dd>
                <a href={charge.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                  Stripe receipt <ExternalLink size={12} />
                </a>
              </dd>
            </>
          )}
        </dl>

        {!chargeAccess && (
          <p className="text-xs text-amber-700">
            The Stripe API key may not read charges, so the payment method, refunds and receipt are missing. Give the restricted key
            Charges: Read.
          </p>
        )}
        <p className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 text-xs text-ink-500">
          <span>Read live from Stripe{payment && !payment.livemode ? " (test mode)" : ""}.</span>
          {payment && (
            <a
              href={stripePaymentUrl(stripeMode(), payment.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
            >
              Open in Stripe <ExternalLink size={12} />
            </a>
          )}
        </p>
      </div>
    </Card>
  );
}
