import "server-only";
import { audit } from "./audit";
import { db } from "./db";
import { notifyAdmins, notifyOrderConfirmed, notifyOrderPaid, notifyPaymentFailed, notifyRefund } from "./email/notify";

export const ORDER_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;
export const PAYMENT_STATUSES = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export const FULFILLMENT_STATUSES = ["PENDING", "ACCEPTED", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export const RETURN_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "REFUNDED"] as const;

/** EU right of withdrawal: 14 days after delivery (we use a 30-day window from purchase as a generous upper bound). */
export const RETURN_WINDOW_DAYS = 30;

// Every transition below is a conditional update on the current payment status, so it is safe to run
// twice or concurrently (webhook retries, the webhook racing the customer's return page): only the first
// caller changes anything, and only that caller performs side effects (audit entries, emails).

/**
 * Called once a payment provider confirms payment. Idempotent and race-safe:
 * the first caller flips UNPAID/PENDING/FAILED → PAID and then routes the order to suppliers.
 *
 * This is the core of the dropshipping flow — one SupplierOrder is created per supplier
 * with the items they must ship directly to the customer.
 */
export async function markOrderPaid(
  orderId: string,
  paymentRef?: string | null,
  paymentIntentId?: string | null,
): Promise<boolean> {
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      // FAILED is included: money that arrives after a session was marked failed or expired is still honoured
      where: { id: orderId, paymentStatus: { in: ["UNPAID", "PENDING", "FAILED"] } },
      data: {
        paymentStatus: "PAID",
        status: "PROCESSING",
        paidAt: new Date(),
        stockReserved: false,
        paymentFailureReason: null,
        ...(paymentRef ? { paymentRef } : {}),
        ...(paymentIntentId ? { paymentIntentId } : {}),
      },
    });
    if (claimed.count === 0) return null;

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

    // Stock is held (not decremented) while a payment is open; the sale takes it now. A payment that
    // arrives after its hold lapsed can find too little stock: take what is left and flag it for review.
    const oversold: string[] = [];
    for (const item of order.items) {
      if (!item.variantId) continue;
      const taken = await tx.productVariant.updateMany({
        where: { id: item.variantId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (taken.count === 0) {
        await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stock: 0 } });
        oversold.push(`${item.title} (${item.variantName}) × ${item.quantity}`);
      }
    }

    if (order.discountCode) {
      await tx.discountCode.updateMany({
        where: { storeId: order.storeId, code: order.discountCode },
        data: { usedCount: { increment: 1 } },
      });
    }
    return { oversold };
  });

  if (!result) return false;
  await audit(null, "order.paid", "Order", orderId, `Payment confirmed${paymentRef ? ` (${paymentRef})` : ""}; routed to suppliers`);
  if (result.oversold.length > 0) {
    await audit(null, "order.oversold", "Order", orderId, `Not enough stock when payment arrived: ${result.oversold.join(", ")}`);
  }
  await notifyOrderPaid(orderId, result.oversold);
  return true;
}

/** A delayed method (e.g. SEPA Direct Debit) was submitted; the bank confirms it later. Stock stays held. */
export async function markPaymentPending(orderId: string, paymentIntentId?: string | null): Promise<boolean> {
  const res = await db.order.updateMany({
    where: { id: orderId, paymentStatus: "UNPAID" },
    data: { paymentStatus: "PENDING", ...(paymentIntentId ? { paymentIntentId } : {}) },
  });
  if (res.count > 0) {
    await audit(null, "order.payment_pending", "Order", orderId, "Payment submitted; waiting for the bank to confirm");
    await notifyOrderConfirmed(orderId);
  }
  return res.count > 0;
}

export async function markPaymentFailed(orderId: string, reason = "Payment failed or expired"): Promise<boolean> {
  const res = await db.order.updateMany({
    where: { id: orderId, paymentStatus: { in: ["UNPAID", "PENDING"] } },
    data: { paymentStatus: "FAILED", status: "CANCELLED", stockReserved: false, paymentFailureReason: reason },
  });
  if (res.count > 0) {
    await audit(null, "order.payment_failed", "Order", orderId, reason);
    await notifyPaymentFailed(orderId);
  }
  return res.count > 0;
}

/**
 * Cancel an order nobody has paid for (customer started a new checkout, merchant or admin cancelled it).
 * The payment status stays UNPAID: if money still arrives, markOrderPaid fulfils the order.
 */
export async function cancelUnpaidOrder(orderId: string, reason: string, userId: string | null = null): Promise<boolean> {
  const res = await db.order.updateMany({
    where: { id: orderId, paymentStatus: "UNPAID" },
    data: { status: "CANCELLED", stockReserved: false, paymentFailureReason: reason },
  });
  if (res.count > 0) await audit(userId, "order.cancelled", "Order", orderId, reason);
  return res.count > 0;
}

/** Record a full refund (from our refund button or the provider's dashboard). Unshipped supplier orders are cancelled. */
export async function markOrderRefunded(orderId: string, detail: string, userId: string | null = null): Promise<boolean> {
  const changed = await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "PAID" },
      data: { status: "REFUNDED", paymentStatus: "REFUNDED", refundedAt: new Date() },
    });
    if (res.count === 0) return false;
    await tx.supplierOrder.updateMany({ where: { orderId, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "CANCELLED" } });
    return true;
  });
  if (changed) {
    await audit(userId, "order.refunded", "Order", orderId, detail);
    await notifyRefund(orderId, { full: true });
  }
  return changed;
}

/** The provider reports a payment we cannot match to the order (e.g. a different amount): never fulfil it automatically. */
export async function flagPaymentForReview(orderId: string, reason: string): Promise<void> {
  const res = await db.order.updateMany({
    where: { id: orderId, paymentStatus: { in: ["UNPAID", "PENDING", "FAILED"] } },
    data: { paymentFailureReason: `Needs review: ${reason}` },
  });
  if (res.count > 0) {
    console.error(`[payments] order ${orderId} needs review: ${reason}`);
    await audit(null, "order.payment_review", "Order", orderId, reason);
    await notifyAdmins({ kind: "payment_review", orderId, title: "Payment needs review", message: `${reason}. It was not sent to suppliers.` });
  }
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
