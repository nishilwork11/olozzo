import { OrderStatusTabs, OrdersTable } from "@/components/orders/OrdersTable";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const [orders, grouped] = await Promise.all([
    db.order.findMany({ where: status ? { status } : {}, include: { store: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  return (
    <>
      <PageHeader title="All orders" description="Every order across all stores, with payment and fulfilment status." />
      <OrderStatusTabs basePath="/admin/orders" current={status} counts={counts} />
      <OrdersTable orders={orders} hrefBase="/admin/orders" showStore showProfit />
    </>
  );
}
