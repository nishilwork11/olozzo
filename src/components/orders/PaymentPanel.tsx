import type { Order, StripeEvent } from "@prisma/client";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardHeader, StatusBadge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { stripePaymentUrl, type StripeMode } from "@/lib/payments/rules";
import { formatDateTime } from "@/lib/utils";

const PROVIDER_NAMES: Record<string, string> = { stripe: "Stripe", mollie: "Mollie", demo: "Demo (no money moved)" };

const EVENT_LABELS: Record<string, string> = {
  "checkout.session.completed": "Checkout completed",
  "checkout.session.async_payment_succeeded": "Bank payment succeeded",
  "checkout.session.async_payment_failed": "Bank payment failed",
  "checkout.session.expired": "Payment page expired",
  "charge.refunded": "Refund recorded",
  "charge.dispute.created": "Dispute opened",
};

/** Payment details for staff: status, provider references, the stock hold and the webhook history. */
export function PaymentPanel({
  order,
  events,
  stripeMode,
  actions,
}: {
  order: Order;
  events: StripeEvent[];
  stripeMode: StripeMode | null;
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

        {order.paymentProvider === "stripe" && (
          <div>
            <p className="mb-2 font-medium">Stripe events</p>
            {events.length === 0 ? (
              <p className="text-xs text-ink-500">No webhook events received for this order yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id} className="text-xs">
                    <span className="font-medium text-ink-800">{EVENT_LABELS[e.type] ?? e.type}</span>
                    <span className="text-ink-500"> · {formatDateTime(e.createdAt)}</span>
                    {e.summary && <span className="block text-ink-500">{e.summary}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {actions && <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">{actions}</div>}
      </div>
    </Card>
  );
}
