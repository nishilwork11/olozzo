import { OrderStatusTabs, OrdersTable } from "@/components/orders/OrdersTable";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireMerchantStore } from "@/lib/merchant";

export default async function MerchantOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { store } = await requireMerchantStore();
  const [orders, grouped] = await Promise.all([
    db.order.findMany({ where: { storeId: store.id, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.order.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
  ]);
  return (
    <>
      <PageHeader
        title="Orders"
        description="Paid orders are routed to suppliers automatically. Track fulfilment, refund and handle returns here."
      />
      <OrderStatusTabs basePath="/merchant/orders" current={status} counts={Object.fromEntries(grouped.map((g) => [g.status, g._count]))} />
      <OrdersTable orders={orders} hrefBase="/merchant/orders" showProfit />
    </>
  );
}
