import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Lock, XCircle } from "lucide-react";
import { AddressBlock, OrderItemsList, OrderTimeline, OrderTotals, ShipmentList } from "@/components/orders/OrderParts";
import { ClearCart } from "@/components/store/StoreClient";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewOrder, orderPagePath } from "@/lib/order-access";
import { verifyPayment } from "@/lib/payments";
import { getStorefront } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Order status", robots: { index: false } };

async function loadOrder(id: string) {
  return db.order.findUnique({
    where: { id },
    include: { store: true, items: true, fulfillments: { include: { items: true }, orderBy: { createdAt: "asc" } } },
  });
}

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ t?: string; session_id?: string }>;
}) {
  const { slug, orderId } = await params;
  const { t: token, session_id: returnedSessionId } = await searchParams;
  const [store, user] = await Promise.all([getStorefront(slug), getCurrentUser()]);
  if (!store) notFound();

  let order = await loadOrder(orderId);
  if (!order || order.storeId !== store.id) notFound();

  // Names, addresses and items are shown only to the customer (signed in, or holding the link from checkout),
  // the store owner and admins. Anyone else learns nothing, not even whether the order exists.
  if (!canViewOrder(order, user, token)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <Lock className="mx-auto text-ink-400" size={44} />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Open your order from its link</h1>
        <p className="mt-3 text-sm text-ink-500">
          For your privacy, order details are only shown through the link you were given at checkout, or when you are signed in to
          the account you ordered with.
        </p>
        {!user && (
          <Link href={`/login?next=${encodeURIComponent(`/s/${store.slug}/order/${order.id}`)}`} className="btn btn-accent mt-6">
            Sign in
          </Link>
        )}
      </div>
    );
  }

  // Confirm directly with the payment provider before rendering (Stripe's recommended landing-page
  // fulfilment; the webhook remains the guarantee for customers who never come back)
  if (order.paymentStatus === "UNPAID" || order.paymentStatus === "PENDING") {
    await verifyPayment(order, returnedSessionId);
    order = (await loadOrder(orderId))!;
  }

  const status = order.paymentStatus;
  const bought = status === "PAID" || status === "PENDING" || status === "REFUNDED";
  const selfLink = orderPagePath(store.slug, order.id, token);
  const isCustomer = user?.id === order.customerId;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {bought && <ClearCart orderId={order.id} />}

      <div className="text-center">
        {status === "PAID" ? (
          <CheckCircle2 className="mx-auto text-accent" size={52} />
        ) : status === "FAILED" || (status === "UNPAID" && order.status === "CANCELLED") ? (
          <XCircle className="mx-auto text-red-500" size={52} />
        ) : status === "UNPAID" || status === "PENDING" ? (
          <Clock className="mx-auto text-amber-500" size={52} />
        ) : (
          <CheckCircle2 className="mx-auto text-ink-400" size={52} />
        )}
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          {status === "PAID"
            ? `Thank you, ${order.name.split(" ")[0]}!`
            : status === "PENDING"
              ? "Payment is being processed"
              : status === "FAILED" || (status === "UNPAID" && order.status === "CANCELLED")
                ? "Payment was not completed"
                : status === "UNPAID"
                  ? "Waiting for payment confirmation"
                  : `Order ${order.status.toLowerCase()}`}
        </h1>
        <p className="mt-2 text-ink-500">
          Order <span className="font-mono font-semibold text-ink-900">{order.number}</span> · placed {formatDateTime(order.createdAt)}
        </p>

        {status === "PAID" && (
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
            Your payment is confirmed. Your items ship directly from our EU partner warehouses, and tracking details appear on this page
            as soon as each parcel is on its way.{" "}
            {isCustomer ? "You can also find this order under My orders in your account." : "Bookmark this page to check your order later."}
          </p>
        )}
        {status === "PENDING" && (
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
            Your payment was submitted. Bank payments such as SEPA Direct Debit can take a few business days to confirm. Your items are
            reserved, and the order ships as soon as the payment arrives. You don&apos;t need to pay again.{" "}
            <Link href={selfLink} className="font-semibold text-accent underline">
              Refresh status
            </Link>
          </p>
        )}
        {status === "UNPAID" && order.status !== "CANCELLED" && (
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
            We haven&apos;t received confirmation of your payment yet. This usually takes a few seconds.{" "}
            <Link href={selfLink} className="font-semibold text-accent underline">
              Refresh status
            </Link>
          </p>
        )}
        {(status === "FAILED" || (status === "UNPAID" && order.status === "CANCELLED")) && (
          <>
            <p className="mx-auto mt-3 max-w-lg text-sm text-ink-500">
              No money was taken for this order. Your cart is still saved, so you can try again with the same or another payment method.
            </p>
            <Link href={`/s/${store.slug}/checkout`} className="btn btn-accent mt-6">
              Try again
            </Link>
          </>
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
