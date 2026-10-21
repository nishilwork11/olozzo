import "server-only";
import { audit } from "./audit";
import { db } from "./db";

export const ORDER_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;
export const FULFILLMENT_STATUSES = ["PENDING", "ACCEPTED", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export const RETURN_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "REFUNDED"] as const;

/** EU right of withdrawal: 14 days after delivery (we use a 30-day window from purchase as a generous upper bound). */
export const RETURN_WINDOW_DAYS = 30;

/**
 * Called once a payment provider confirms payment. Idempotent and race-safe:
 * the first caller flips UNPAID → PAID and then routes the order to suppliers.
 *
 * This is the core of the dropshipping flow — one SupplierOrder is created per supplier
 * with the items they must ship directly to the customer.
 */
export async function markOrderPaid(orderId: string, paymentRef?: string | null): Promise<boolean> {
  const routed = await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: { in: ["UNPAID", "FAILED"] } },
      data: {
        paymentStatus: "PAID",
        status: "PROCESSING",
        paidAt: new Date(),
        ...(paymentRef ? { paymentRef } : {}),
      },
    });
    if (claimed.count === 0) return false;

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });

    const bySupplier = new Map<string, typeof order.items>();
    for (const item of order.items) {
      bySupplier.set(item.supplierId, [...(bySupplier.get(item.supplierId) ?? []), item]);
    }

    for (const [supplierId, items] of bySupplier) {
      const fulfillment = await tx.supplierOrder.create({
        data: {
          orderId,
          supplierId,
          itemsCost: items.reduce((s, i) => s + i.unitCost * i.quantity, 0),
          shippingCost: Math.max(0, ...items.map((i) => i.shippingCost)),
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { supplierOrderId: fulfillment.id },
      });
    }

    for (const item of order.items) {
      if (!item.variantId) continue;
      await tx.productVariant.updateMany({
        where: { id: item.variantId },
        data: { stock: { decrement: item.quantity } },
      });
    }
    await tx.productVariant.updateMany({ where: { stock: { lt: 0 } }, data: { stock: 0 } });

    if (order.discountCode) {
      await tx.discountCode.updateMany({
        where: { storeId: order.storeId, code: order.discountCode },
        data: { usedCount: { increment: 1 } },
      });
    }
    return true;
  });

  if (routed) await audit(null, "order.paid", "Order", orderId, `Payment confirmed${paymentRef ? ` (${paymentRef})` : ""}; routed to suppliers`);
  return routed;
}

export async function markPaymentFailed(orderId: string, reason = "Payment failed or expired") {
  const res = await db.order.updateMany({
    where: { id: orderId, paymentStatus: "UNPAID" },
    data: { paymentStatus: "FAILED", status: "CANCELLED" },
  });
  if (res.count > 0) await audit(null, "order.payment_failed", "Order", orderId, reason);
}

/** Derive the customer-facing order status from its supplier fulfilments. */
export async function syncOrderStatus(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { fulfillments: true } });
  if (!order || ["CANCELLED", "REFUNDED", "PENDING"].includes(order.status)) return;
  const active = order.fulfillments.filter((f) => f.status !== "CANCELLED");
  if (active.length === 0) return;

  let status = "PROCESSING";
  if (active.every((f) => f.status === "DELIVERED")) status = "DELIVERED";
  else if (active.every((f) => f.status === "SHIPPED" || f.status === "DELIVERED")) status = "SHIPPED";

  if (status !== order.status) await db.order.update({ where: { id: orderId }, data: { status } });
}
