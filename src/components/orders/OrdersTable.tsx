import Link from "next/link";
import type { Order, Store } from "@prisma/client";
import { Receipt } from "lucide-react";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { countryName } from "@/lib/eu";
import { formatMoney } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";
import { ORDER_STATUSES } from "@/lib/orders";

export function OrderStatusTabs({ basePath, current, counts }: { basePath: string; current?: string; counts: Record<string, number> }) {
  const tabs = [{ key: "", label: "All" }, ...ORDER_STATUSES.map((s) => ({ key: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))];
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key ? `${basePath}?status=${t.key}` : basePath}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
            (current ?? "") === t.key ? "border-ink-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800",
          )}
        >
          {t.label}
          <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 text-xs text-ink-600">{t.key ? counts[t.key] ?? 0 : Object.values(counts).reduce((a, b) => a + b, 0)}</span>
        </Link>
      ))}
    </div>
  );
}

export function OrdersTable({
  orders,
  hrefBase,
  showStore = false,
  showProfit = false,
}: {
  orders: (Order & { store?: Store; _count?: { items: number } })[];
  hrefBase: string;
  showStore?: boolean;
  showProfit?: boolean;
}) {
  if (orders.length === 0) {
    return (
      <Card>
        <EmptyState icon={Receipt} title="No orders here yet" description="Orders appear as soon as customers check out." />
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Order</th>
            {showStore && <th>Store</th>}
            <th>Customer</th>
            <th>Payment</th>
            <th>Status</th>
            <th className="text-right">Total</th>
            {showProfit && <th className="text-right">Profit</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const profit = o.total - o.vatTotal - o.costTotal - o.platformFee;
            return (
              <tr key={o.id} className="hover:bg-ink-50/60">
                <td>
                  <Link href={`${hrefBase}/${o.id}`} className="font-mono font-semibold hover:underline">
                    {o.number}
                  </Link>
                  <p className="text-xs text-ink-500">{formatDateTime(o.createdAt)}</p>
                </td>
                {showStore && <td className="text-ink-600">{o.store?.name}</td>}
                <td>
                  <p>{o.name}</p>
                  <p className="text-xs text-ink-500">
                    {o.city}, {countryName(o.country)}
                  </p>
                </td>
                <td>
                  <StatusBadge status={o.paymentStatus} />
                  <p className="mt-0.5 text-xs capitalize text-ink-500">{o.paymentProvider}</p>
                </td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td className="text-right font-medium">{formatMoney(o.total)}</td>
                {showProfit && (
                  <td className={cn("text-right font-medium", o.paymentStatus !== "PAID" ? "text-ink-400" : profit >= 0 ? "text-emerald-700" : "text-red-600")}>
                    {o.paymentStatus === "PAID" ? formatMoney(profit) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
