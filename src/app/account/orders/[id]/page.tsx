import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AddressBlock, OrderItemsList, OrderTimeline, OrderTotals, ShipmentList } from "@/components/orders/OrderParts";
import { SubmitButton } from "@/components/client";
import { Card, Flash, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { RETURN_WINDOW_DAYS } from "@/lib/orders";
import { formatDate, formatDateTime } from "@/lib/utils";
import { requestReturn } from "../../actions";

const REASONS = ["Changed my mind", "Wrong size or fit", "Item not as described", "Arrived damaged or defective", "Received the wrong item", "Other"];

export const metadata: Metadata = { title: "Order details" };

export default async function AccountOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const user = await requireUser();
  const order = await db.order.findFirst({
    where: { id, customerId: user.id },
    include: { store: true, items: true, fulfillments: { include: { items: true }, orderBy: { createdAt: "asc" } }, returns: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) notFound();

  const windowEnds = new Date(order.createdAt.getTime() + RETURN_WINDOW_DAYS * 86400000);
  const hasOpenReturn = order.returns.some((r) => r.status === "REQUESTED" || r.status === "APPROVED");
  const canReturn =
    order.paymentStatus === "PAID" && ["PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status) && windowEnds > new Date() && !hasOpenReturn;

  return (
    <div style={{ "--accent": order.store.accentColor } as React.CSSProperties}>
      <Link href="/account" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> All orders
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">
            Order <span className="font-mono">{order.number}</span>
          </h2>
          <p className="text-sm text-ink-500">
            {order.store.name} · {formatDateTime(order.createdAt)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <Flash {...flash} />

      {order.paymentStatus === "PENDING" && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your bank payment is being processed. This can take a few business days; your items are reserved and ship as soon as it is
          confirmed. You don&apos;t need to pay again.
        </p>
      )}
      {order.paymentStatus === "UNPAID" && order.status !== "CANCELLED" && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          We haven&apos;t received your payment for this order yet.
        </p>
      )}
      {(order.paymentStatus === "FAILED" || (order.paymentStatus === "UNPAID" && order.status === "CANCELLED")) && (
        <p className="mb-6 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700">
          This order was not paid, so no money was taken and nothing will ship.
        </p>
      )}

      <Card className="mb-6 p-6">
        <OrderTimeline order={order} />
      </Card>

      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-6 md:col-span-3">
          <Card className="p-6">
            <OrderItemsList items={order.items} />
            <div className="mt-4 border-t border-ink-100 pt-4">
              <OrderTotals order={order} />
            </div>
          </Card>

          {order.returns.map((r) => (
            <Card key={r.id} className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Return request</h3>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-2 text-sm">
                {r.reason} · {formatDate(r.createdAt)}
              </p>
              {r.details && <p className="mt-1 text-sm text-ink-500">{r.details}</p>}
              {r.resolution && <p className="mt-2 rounded-lg bg-ink-50 p-3 text-sm">Store: {r.resolution}</p>}
            </Card>
          ))}

          {canReturn && (
            <Card className="p-6">
              <h3 className="font-semibold">Request a return</h3>
              <p className="mt-1 text-sm text-ink-500">
                You can withdraw from this purchase until {formatDate(windowEnds)} (EU 14-day right of withdrawal after delivery).
              </p>
              <form action={requestReturn.bind(null, order.id)} className="mt-4 space-y-3">
                <select name="reason" required defaultValue="" className="input">
                  <option value="" disabled>Choose a reason</option>
                  {REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <textarea name="details" rows={3} placeholder="Anything the store should know? (optional)" className="input" />
                <SubmitButton className="btn btn-dark">Request return</SubmitButton>
              </form>
            </Card>
          )}
        </div>
        <div className="space-y-6 md:col-span-2">
          <Card className="p-6">
            <h3 className="mb-3 font-semibold">Shipments</h3>
            <ShipmentList fulfillments={order.fulfillments} />
          </Card>
          <Card className="p-6">
            <h3 className="mb-3 font-semibold">Delivery address</h3>
            <AddressBlock order={order} />
          </Card>
        </div>
      </div>
    </div>
  );
}
