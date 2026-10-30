import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AddressBlock, OrderItemsList, OrderTimeline, OrderTotals, ShipmentList } from "@/components/orders/OrderParts";
import { PaymentPanel } from "@/components/orders/PaymentPanel";
import { SubmitButton } from "@/components/client";
import { Card, CardHeader, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { stripeEnabled, stripeMode } from "@/lib/payments/stripe";
import { formatDateTime } from "@/lib/utils";
import { adminCancelUnpaidOrder, adminRefundOrder, adminSyncPayment } from "../../actions";
import { StripeCheck } from "./StripeCheck";

export const metadata: Metadata = { title: "Order details · Admin" };

export default async function AdminOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const [order, logs, emails] = await Promise.all([
    db.order.findUnique({
      where: { id },
      include: {
        store: true,
        items: true,
        fulfillments: { include: { supplier: true, items: true }, orderBy: { createdAt: "asc" } },
        returns: { orderBy: { createdAt: "desc" } },
      },
    }),
    db.paymentLog.findMany({ where: { orderId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.emailLog.findMany({ where: { orderId: id }, orderBy: { createdAt: "desc" }, omit: { payload: true } }),
  ]);
  if (!order) notFound();

  const canSync = (order.paymentStatus === "UNPAID" || order.paymentStatus === "PENDING") && order.paymentProvider !== "demo";
  const canCancel = order.paymentStatus === "UNPAID" && order.status !== "CANCELLED";
  const showStripeCheck = order.paymentProvider === "stripe" && stripeEnabled() && Boolean(order.paymentRef || order.paymentIntentId);

  return (
    <>
      <Link href="/admin/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> All orders
      </Link>
      <PageHeader
        title={`Order ${order.number}`}
        description={`${order.store.name} · ${formatDateTime(order.createdAt)} · ${order.paymentProvider} payment`}
        actions={
          <>
            <Link href={`/s/${order.store.slug}/order/${order.id}`} target="_blank" className="btn btn-secondary">
              Customer view <ExternalLink size={14} />
            </Link>
            <StatusBadge status={order.paymentStatus} />
            <StatusBadge status={order.status} />
          </>
        }
      />
      <Flash {...flash} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <OrderTimeline order={order} />
          </Card>
          <Card>
            <CardHeader title="Items" />
            <div className="px-5">
              <OrderItemsList items={order.items} showCost />
            </div>
            <div className="border-t border-ink-100 p-5">
              <OrderTotals order={order} showProfit />
            </div>
          </Card>
          <Card>
            <CardHeader title="Supplier fulfilments" />
            <div className="p-5">
              <ShipmentList fulfillments={order.fulfillments} showSupplier />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <PaymentPanel
            order={order}
            logs={logs}
            stripeMode={stripeMode()}
            showLogDetails
            actions={
              canSync || canCancel || order.paymentStatus === "PAID" ? (
                <>
                  {canSync && (
                    <form action={adminSyncPayment.bind(null, order.id)}>
                      <SubmitButton className="btn btn-secondary btn-sm">Check with {order.paymentProvider === "stripe" ? "Stripe" : "Mollie"}</SubmitButton>
                    </form>
                  )}
                  {canCancel && (
                    <form action={adminCancelUnpaidOrder.bind(null, order.id)}>
                      <SubmitButton className="btn btn-danger btn-sm" confirm="Cancel this unpaid order? Its payment page is closed and its stock released.">
                        Cancel order
                      </SubmitButton>
                    </form>
                  )}
                  {order.paymentStatus === "PAID" && (
                    <form action={adminRefundOrder.bind(null, order.id)}>
                      <SubmitButton
                        className="btn btn-danger btn-sm"
                        confirm={`Refund ${formatMoney(order.total)} to ${order.name}? Unshipped supplier orders will be cancelled.`}
                      >
                        Refund {formatMoney(order.total)}
                      </SubmitButton>
                    </form>
                  )}
                </>
              ) : null
            }
          />
          {showStripeCheck && (
            <Suspense fallback={<Card className="p-5 text-sm text-ink-500">Checking with Stripe…</Card>}>
              <StripeCheck order={order} />
            </Suspense>
          )}
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Customer</h2>
            <AddressBlock order={order} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Emails</h2>
            {emails.length === 0 ? (
              <p className="text-sm text-ink-500">No emails sent for this order.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {emails.map((e) => (
                  <li key={e.id}>
                    <Link href={`/admin/emails/${e.id}`} className="font-medium hover:underline">
                      {e.subject}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <StatusBadge status={e.status} />
                      <span className="break-all">{e.to}</span>
                      <span>{formatDateTime(e.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Returns</h2>
            {order.returns.length === 0 ? (
              <p className="text-sm text-ink-500">No return requests.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {order.returns.map((r) => (
                  <li key={r.id}>
                    <StatusBadge status={r.status} /> <span className="font-medium">{r.reason}</span>
                    {r.details && <p className="text-ink-500">{r.details}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
