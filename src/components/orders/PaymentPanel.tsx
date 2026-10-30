import type { Order, PaymentLog } from "@prisma/client";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardHeader, StatusBadge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { PAYMENT_EVENT_LABELS } from "@/lib/payments/log-details";
import { stripePaymentUrl, type StripeMode } from "@/lib/payments/rules";
import { cn, formatDateTime } from "@/lib/utils";

const PROVIDER_NAMES: Record<string, string> = { stripe: "Stripe", mollie: "Mollie", demo: "Demo (no money moved)" };

export const LOG_LEVEL_TEXT: Record<string, string> = { INFO: "text-ink-800", WARN: "text-amber-700", ERROR: "text-red-700" };

/**
 * Payment details for staff: status, provider references, the stock hold and the payment log (newest first).
 * `showLogDetails` adds the stored provider data (error codes, request ids) to each log entry, for admins.
 */
export function PaymentPanel({
  order,
  logs,
  stripeMode,
  showLogDetails = false,
  actions,
}: {
  order: Order;
  logs: PaymentLog[];
  stripeMode: StripeMode | null;
  showLogDetails?: boolean;
  actions?: React.ReactNode;
}) {
  const needsReview = order.paymentFailureReason?.startsWith("Needs review");
  const open = order.paymentStatus === "UNPAID" && order.status !== "CANCELLED";
  const holdActive = order.stockReserved && (order.paymentStatus === "PENDING" || (order.paymentExpiresAt && order.paymentExpiresAt > new Date()));

  return (
    <Card>
      <CardHeader title="Payment" action={<StatusBadge status={order.paymentStatus} />} />
      <div className="space-y-4 p-5 text-sm">
        {needsReview && (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {order.paymentFailureReason}. The order was not sent to suppliers. Check the payment in the provider&apos;s dashboard, then
              refund it there.
            </span>
          </p>
        )}
        {order.paymentStatus === "PENDING" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            The customer submitted a bank payment (e.g. SEPA Direct Debit). It can take a few business days. Stock stays reserved until it
            succeeds or fails.
          </p>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-ink-500">Provider</dt>
          <dd>{PROVIDER_NAMES[order.paymentProvider] ?? order.paymentProvider}</dd>
          <dt className="text-ink-500">Amount</dt>
          <dd className="font-medium">
            {formatMoney(order.total)} {order.currency}
          </dd>
          {order.paidAt && (
            <>
              <dt className="text-ink-500">Paid</dt>
              <dd>{formatDateTime(order.paidAt)}</dd>
            </>
          )}
          {order.refundedAt && (
            <>
              <dt className="text-ink-500">Refunded</dt>
              <dd>{formatDateTime(order.refundedAt)}</dd>
            </>
          )}
          {open && order.paymentExpiresAt && (
            <>
              <dt className="text-ink-500">Payment page</dt>
              <dd>
                {order.paymentExpiresAt > new Date() ? "open until" : "expired"} {formatDateTime(order.paymentExpiresAt)}
              </dd>
            </>
          )}
          <dt className="text-ink-500">Stock</dt>
          <dd>{holdActive ? "Reserved for this order" : order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED" ? "Taken at payment" : "Not reserved"}</dd>
          {order.paymentRef && (
            <>
              <dt className="text-ink-500">{order.paymentProvider === "stripe" ? "Session" : "Reference"}</dt>
              <dd className="break-all font-mono text-xs">{order.paymentRef}</dd>
            </>
          )}
          {order.paymentIntentId && (
            <>
              <dt className="text-ink-500">Payment</dt>
              <dd>
                <a
                  href={stripePaymentUrl(stripeMode, order.paymentIntentId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all font-mono text-xs text-brand-700 hover:underline"
                >
                  {order.paymentIntentId} <ExternalLink size={12} className="shrink-0" />
                </a>
              </dd>
            </>
          )}
          {order.paymentFailureReason && !needsReview && (
            <>
              <dt className="text-ink-500">Note</dt>
              <dd>{order.paymentFailureReason}</dd>
            </>
          )}
        </dl>

        <div>
          <p className="mb-2 font-medium">Payment log</p>
          {logs.length === 0 ? (
            <p className="text-xs text-ink-500">Nothing recorded for this order yet.</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((l) => (
                <li key={l.id} className="text-xs">
                  <span className={cn("font-medium", LOG_LEVEL_TEXT[l.level])}>{PAYMENT_EVENT_LABELS[l.event] ?? l.event}</span>
                  <span className="text-ink-500"> · {formatDateTime(l.createdAt)}</span>
                  <span className="block text-ink-600">{l.message}</span>
                  {showLogDetails && l.data !== null && (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-ink-400 hover:text-ink-700">Details</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-ink-50 p-2 font-mono text-[11px] text-ink-700">{JSON.stringify(l.data, null, 2)}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {actions && <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">{actions}</div>}
      </div>
    </Card>
  );
}
