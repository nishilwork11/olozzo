import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { OrderStatusTabs, OrdersTable } from "@/components/orders/OrdersTable";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders · Admin" };

const PAYMENT_FILTERS = [
  { key: "review", label: "Needs review", where: { paymentFailureReason: { startsWith: "Needs review" }, paymentStatus: { not: "PAID" } } },
  { key: "PENDING", label: "Bank payment processing", where: { paymentStatus: "PENDING" } },
  { key: "PAID", label: "Paid", where: { paymentStatus: "PAID" } },
  { key: "UNPAID", label: "Unpaid", where: { paymentStatus: "UNPAID" } },
  { key: "FAILED", label: "Failed", where: { paymentStatus: "FAILED" } },
  { key: "REFUNDED", label: "Refunded", where: { paymentStatus: "REFUNDED" } },
] satisfies { key: string; label: string; where: Prisma.OrderWhereInput }[];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; payment?: string }> }) {
  const { status, payment } = await searchParams;
  const paymentFilter = PAYMENT_FILTERS.find((f) => f.key === payment);
  const where: Prisma.OrderWhereInput = { ...(status ? { status } : {}), ...(paymentFilter?.where ?? {}) };
  const [orders, grouped] = await Promise.all([
    db.order.findMany({ where, include: { store: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  return (
    <>
      <PageHeader title="All orders" description="Every order across all stores, with payment and fulfilment status." />
      <OrderStatusTabs basePath="/admin/orders" current={status} counts={counts} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-500">Payment:</span>
        {PAYMENT_FILTERS.map((f) => {
          const active = f.key === payment;
          const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(active ? {} : { payment: f.key }) }).toString();
          return (
            <Link
              key={f.key}
              href={`/admin/orders${qs ? `?${qs}` : ""}`}
              className={cn(
                "rounded-full px-3 py-1 ring-1 ring-inset",
                active ? "bg-ink-900 text-white ring-ink-900" : "text-ink-600 ring-ink-200 hover:ring-ink-400",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>
      <OrdersTable orders={orders} hrefBase="/admin/orders" showStore showProfit />
    </>
  );
}
