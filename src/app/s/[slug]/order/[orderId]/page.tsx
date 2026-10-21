import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { AddressBlock, OrderItemsList, OrderTimeline, OrderTotals, ShipmentList } from "@/components/orders/OrderParts";
import { ClearCart } from "@/components/store/StoreClient";
import { db } from "@/lib/db";
import { verifyPayment } from "@/lib/payments";
import { getStorefront } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Order status", robots: { index: false } };

async function loadOrder(id: string) {
  return db.order.findUnique({
    where: { id },
    include: { items: true, fulfillments: { include: { items: true }, orderBy: { createdAt: "asc" } } },
  });
}

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { slug, orderId } = await params;
  const { session_id } = await searchParams;
  const store = await getStorefront(slug);
  if (!store) notFound();

  let order = await loadOrder(orderId);
  if (!order || order.storeId !== store.id) notFound();

  // Confirm directly with the payment provider (works even without webhooks)
  if (order.paymentStatus === "UNPAID") {
    await verifyPayment(order, session_id);
    order = (await loadOrder(orderId))!;
  }

  const paid = order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {paid && <ClearCart />}

      <div className="text-center">
        {order.paymentStatus === "PAID" ? (
          <CheckCircle2 className="mx-auto text-accent" size={52} />
        ) : order.paymentStatus === "FAILED" ? (
          <XCircle className="mx-auto text-red-500" size={52} />
        ) : order.paymentStatus === "UNPAID" ? (
          <Clock className="mx-auto text-amber-500" size={52} />
        ) : (
          <CheckCircle2 className="mx-auto text-ink-400" size={52} />
        )}
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          {order.paymentStatus === "PAID"
            ? `Thank you, ${order.name.split(" ")[0]}!`
            : order.paymentStatus === "FAILED"
              ? "Payment was not completed"
              : order.paymentStatus === "UNPAID"
                ? "Waiting for payment confirmation"
                : `Order ${order.status.toLowerCase()}`}
        </h1>
        <p className="mt-2 text-ink-500">
          Order <span className="font-mono font-semibold text-ink-900">{order.number}</span> · placed {formatDateTime(order.createdAt)}
        </p>
        {order.paymentStatus === "PAID" && (
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
            A confirmation has been sent to {order.email}. Your items ship directly from our EU partner warehouses — you&apos;ll get
            tracking details as soon as each parcel is on its way.
          </p>
        )}
        {order.paymentStatus === "UNPAID" && (
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
            Some payment methods (like SEPA Direct Debit) take a moment to confirm.{" "}
            <Link href={`/s/${store.slug}/order/${order.id}`} className="font-semibold text-accent underline">
              Refresh status
            </Link>
          </p>
        )}
        {order.paymentStatus === "FAILED" && (
          <Link href={`/s/${store.slug}/checkout`} className="btn btn-accent mt-6">
            Try again
          </Link>
        )}
      </div>

      <div className="card mt-10 p-6">
        <OrderTimeline order={order} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-5">
        <div className="card p-6 md:col-span-3">
          <h2 className="font-semibold">Items</h2>
          <div className="mt-2">
            <OrderItemsList items={order.items} />
          </div>
          <div className="mt-4 border-t border-ink-100 pt-4">
            <OrderTotals order={order} />
          </div>
        </div>
        <div className="space-y-6 md:col-span-2">
          <div className="card p-6">
            <h2 className="mb-3 font-semibold">Shipping to</h2>
            <AddressBlock order={order} />
          </div>
          <div className="card p-6">
            <h2 className="mb-3 font-semibold">Shipments</h2>
            <ShipmentList fulfillments={order.fulfillments} />
          </div>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link href={`/s/${store.slug}`} className="btn btn-secondary">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
