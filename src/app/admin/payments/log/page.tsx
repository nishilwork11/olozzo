import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { LOG_LEVEL_TEXT } from "@/components/orders/PaymentPanel";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { PAYMENT_EVENT_LABELS } from "@/lib/payments/log-details";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Payment log · Admin" };

const LEVEL_FILTERS = [
  { key: "problems", label: "Warnings & errors", where: { level: { in: ["WARN", "ERROR"] } } },
  { key: "ERROR", label: "Errors", where: { level: "ERROR" } },
  { key: "webhook", label: "Webhook", where: { event: { startsWith: "webhook." } } },
  { key: "refund", label: "Refunds & disputes", where: { OR: [{ event: { startsWith: "refund." } }, { event: { startsWith: "dispute." } }] } },
] satisfies { key: string; label: string; where: Prisma.PaymentLogWhereInput }[];

export default async function AdminPaymentLog({ searchParams }: { searchParams: Promise<{ level?: string; order?: string }> }) {
  const { level, order: orderNumberQuery } = await searchParams;
  const filter = LEVEL_FILTERS.find((f) => f.key === level);
  const order = orderNumberQuery
    ? await db.order.findFirst({
        where: { OR: [{ id: orderNumberQuery.trim() }, { number: { equals: orderNumberQuery.trim(), mode: "insensitive" } }] },
        select: { id: true },
      })
    : null;
  const where: Prisma.PaymentLogWhereInput = {
    ...(filter?.where ?? {}),
    // An order number that matches nothing shows nothing, rather than every entry
    ...(orderNumberQuery ? { orderId: order?.id ?? "-" } : {}),
  };
  const logs = await db.paymentLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
  const orders = await db.order.findMany({
    where: { id: { in: logs.map((l) => l.orderId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, number: true },
  });
  const orderNumber = new Map(orders.map((o) => [o.id, o.number]));

  return (
    <>
      <Link href="/admin/payments" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> Payments
      </Link>
      <PageHeader
        title="Payment log"
        description="Every payment step and every answer from Stripe: payments started, paid, declined, expired or refunded, and webhooks that failed (last 300 entries)."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {LEVEL_FILTERS.map((f) => {
          const active = f.key === level;
          const qs = new URLSearchParams({ ...(orderNumberQuery ? { order: orderNumberQuery } : {}), ...(active ? {} : { level: f.key }) }).toString();
          return (
            <Link
              key={f.key}
              href={`/admin/payments/log${qs ? `?${qs}` : ""}`}
              className={cn(
                "rounded-full px-3 py-1 ring-1 ring-inset",
                active ? "bg-ink-900 text-white ring-ink-900" : "text-ink-600 ring-ink-200 hover:ring-ink-400",
              )}
            >
              {f.label}
            </Link>
          );
        })}
        <form className="ml-auto flex gap-2">
          {level && <input type="hidden" name="level" value={level} />}
          <input name="order" defaultValue={orderNumberQuery ?? ""} placeholder="Order number, e.g. OLZ-…" className="input w-56 py-1" />
          <button className="btn btn-secondary btn-sm">Find</button>
        </form>
      </div>
      <Card className="overflow-x-auto">
        {logs.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">No entries.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Order</th>
                <th>What happened</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap text-ink-500">{formatDateTime(l.createdAt)}</td>
                  <td className="whitespace-nowrap">
                    <span className={cn("font-medium", LOG_LEVEL_TEXT[l.level])}>{PAYMENT_EVENT_LABELS[l.event] ?? l.event}</span>
                    <span className="block font-mono text-xs text-ink-400">
                      {l.provider} · {l.event}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {l.orderId ? (
                      <Link href={`/admin/orders/${l.orderId}`} className="font-mono text-xs font-semibold hover:underline">
                        {orderNumber.get(l.orderId) ?? "Deleted order"}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-400">none</span>
                    )}
                  </td>
                  <td className="text-ink-600">
                    {l.message}
                    {l.ref && <span className="block break-all font-mono text-xs text-ink-400">{l.ref}</span>}
                    {l.data !== null && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-700">Details</summary>
                        <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-ink-50 p-2 font-mono text-[11px] text-ink-700">{JSON.stringify(l.data, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
