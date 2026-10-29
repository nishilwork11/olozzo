import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AddressBlock, OrderItemsList, OrderTimeline, OrderTotals, ShipmentList } from "@/components/orders/OrderParts";
import { PaymentPanel } from "@/components/orders/PaymentPanel";
import { SubmitButton } from "@/components/client";
import { Card, CardHeader, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { requireMerchantStore } from "@/lib/merchant";
import { formatMoney } from "@/lib/money";
import { stripeMode } from "@/lib/payments/stripe";
import { formatDateTime } from "@/lib/utils";
import { cancelUnpaidOrder, refundOrder, resolveReturn } from "../../actions";

export const metadata: Metadata = { title: "Order details · Merchant" };

export default async function MerchantOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const { store } = await requireMerchantStore();
  const [order, events] = await Promise.all([
    db.order.findFirst({
      where: { id, storeId: store.id },
      include: {
        items: true,
        fulfillments: { include: { supplier: true, items: true }, orderBy: { createdAt: "asc" } },
        returns: { orderBy: { createdAt: "desc" } },
      },
    }),
    db.stripeEvent.findMany({ where: { orderId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  if (!order) notFound();

  return (
    <>
      <Link href="/merchant/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> Orders
      </Link>
      <PageHeader
        title={`Order ${order.number}`}
        description={`${formatDateTime(order.createdAt)} · ${order.paymentProvider} payment`}
        actions={
          <>
            <Link href={`/s/${store.slug}/order/${order.id}`} target="_blank" className="btn btn-secondary">
              Customer view <ExternalLink size={14} />
            </Link>
            {order.paymentStatus === "PAID" && (
              <form action={refundOrder.bind(null, order.id)}>
                <SubmitButton className="btn btn-danger" confirm={`Refund ${formatMoney(order.total)} to ${order.name}? Unshipped supplier orders will be cancelled.`}>
                  Refund order
                </SubmitButton>
              </form>
            )}
            {order.paymentStatus === "UNPAID" && order.status === "PENDING" && (
              <form action={cancelUnpaidOrder.bind(null, order.id)}>
                <SubmitButton className="btn btn-danger" confirm="Cancel this unpaid order?">Cancel order</SubmitButton>
              </form>
            )}
          </>
        }
      />
      <Flash {...flash} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="mb-5 flex gap-2">
              <StatusBadge status={order.paymentStatus} /> <StatusBadge status={order.status} />
            </div>
            <OrderTimeline order={order} />
          </Card>

          {order.returns.map((r) => (
            <Card key={r.id} className={r.status === "REQUESTED" ? "border-amber-300 ring-1 ring-amber-300" : ""}>
              <CardHeader title="Return request" action={<StatusBadge status={r.status} />} />
              <div className="space-y-3 p-5 text-sm">
                <p>
                  <span className="text-ink-500">Reason:</span> <b>{r.reason}</b>
                </p>
                {r.details && <p className="rounded-lg bg-ink-50 p-3 text-ink-700">“{r.details}”</p>}
                <p className="text-xs text-ink-500">Requested {formatDateTime(r.createdAt)}</p>
                {r.resolution && <p className="text-ink-600">Resolution: {r.resolution}</p>}
                {(r.status === "REQUESTED" || r.status === "APPROVED") && (
                  <form className="space-y-3 border-t border-ink-100 pt-4">
                    <input name="resolution" placeholder="Note to customer (optional) — e.g. return label sent by email" className="input" />
                    <div className="flex flex-wrap gap-2">
                      {r.status === "REQUESTED" && (
                        <SubmitButton className="btn btn-secondary btn-sm" formAction={resolveReturn.bind(null, r.id, "APPROVED")}>
                          Approve return
                        </SubmitButton>
                      )}
                      {order.paymentStatus === "PAID" && (
                        <SubmitButton
                          className="btn btn-primary btn-sm"
                          formAction={resolveReturn.bind(null, r.id, "REFUNDED")}
                          confirm={`Refund ${formatMoney(order.total)} to the customer?`}
                        >
                          Approve & refund {formatMoney(order.total)}
                        </SubmitButton>
                      )}
                      {r.status === "REQUESTED" && (
                        <SubmitButton className="btn btn-danger btn-sm" formAction={resolveReturn.bind(null, r.id, "REJECTED")}>
                          Reject
                        </SubmitButton>
                      )}
                    </div>
                  </form>
                )}
              </div>
            </Card>
          ))}

          <Card>
            <CardHeader title="Items" />
            <div className="px-5">
              <OrderItemsList items={order.items} showCost />
            </div>
            <div className="border-t border-ink-100 p-5">
              <OrderTotals order={order} showProfit />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <PaymentPanel order={order} events={events} stripeMode={stripeMode()} />
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Customer & shipping</h2>
            <AddressBlock order={order} />
          </Card>
          <Card>
            <CardHeader title="Supplier fulfilment" />
            <div className="p-5">
              <ShipmentList fulfillments={order.fulfillments} showSupplier />
              {order.fulfillments.length > 0 && (
                <p className="mt-3 text-xs text-ink-500">
                  Suppliers ship directly to the customer and add tracking from their dashboard. The order status updates automatically.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
