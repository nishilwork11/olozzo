import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AddressBlock, OrderItemsList, OrderTimeline, OrderTotals, ShipmentList } from "@/components/orders/OrderParts";
import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      store: true,
      items: true,
      fulfillments: { include: { supplier: true, items: true }, orderBy: { createdAt: "asc" } },
      returns: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  return (
    <>
      <Link href="/admin/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> All orders
      </Link>
      <PageHeader
        title={`Order ${order.number}`}
        description={`${order.store.name} · ${formatDateTime(order.createdAt)} · paid via ${order.paymentProvider}${order.paymentRef ? ` (${order.paymentRef})` : ""}`}
        actions={
          <>
            <StatusBadge status={order.paymentStatus} />
            <StatusBadge status={order.status} />
          </>
        }
      />
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
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Customer</h2>
            <AddressBlock order={order} />
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
