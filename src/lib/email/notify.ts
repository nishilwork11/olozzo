import "server-only";
import type { Store } from "@prisma/client";
import { db } from "../db";
import { orderEmailToken, orderPagePath } from "../order-access";
import { queueEmail } from "./outbox";
import {
  adminAlertEmail,
  merchantNewOrderEmail,
  merchantReturnEmail,
  orderConfirmationEmail,
  parcelShippedEmail,
  paymentFailedEmail,
  PLATFORM_BRAND,
  refundEmail,
  returnReceivedEmail,
  returnResolvedEmail,
  supplierNewOrderEmail,
  type EmailBrand,
} from "./templates";

// Who gets which email, and when. Called from the order steps (src/lib/orders.ts), the Stripe webhook, and the
// supplier, customer and merchant actions. Each function loads what its email needs, never throws, and sends each
// email once (the key passed to queueEmail), so it is safe to call from steps that can run more than once.
//
// Customers: order confirmation, each parcel shipped, a bank payment that failed, refunds, returns.
// Staff: the supplier gets each order to ship, the merchant each paid order and return, admins payment problems.

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function storeBrand(store: Pick<Store, "name" | "accentColor">): EmailBrand {
  return { name: store.name, color: store.accentColor };
}

/** The customer's order page, with a link that works without signing in (see orderEmailToken). */
function customerOrderUrl(order: { id: string }, store: Pick<Store, "slug">): string {
  return `${appUrl()}${orderPagePath(store.slug, order.id, orderEmailToken(order.id))}`;
}

const confirmationKey = (orderId: string) => `order-confirmation:${orderId}`;

async function safely(what: string, prepare: () => Promise<unknown>): Promise<void> {
  try {
    await prepare();
  } catch (err) {
    console.error(`[email] could not prepare ${what}`, err);
  }
}

/**
 * The order confirmation, required by EU law (see orderConfirmationEmail). Sent once: when a card payment is
 * confirmed, or when a bank payment is submitted (the order is binding then, even though the money comes later).
 */
export async function notifyOrderConfirmed(orderId: string): Promise<void> {
  await safely("the order confirmation", async () => {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { store: true, items: true } });
    if (!order) return;
    await queueEmail({
      key: confirmationKey(order.id),
      kind: "order_confirmation",
      orderId: order.id,
      to: [order.email],
      fromName: order.store.name,
      replyTo: order.store.supportEmail,
      content: orderConfirmationEmail({
        brand: storeBrand(order.store),
        order,
        bankPaymentPending: order.paymentStatus === "PENDING",
        parcels: new Set(order.items.map((i) => i.supplierId)).size,
        orderUrl: customerOrderUrl(order, order.store),
        withdrawalUrl: `${appUrl()}/legal/withdrawal`,
        termsUrl: `${appUrl()}/legal/terms`,
        supportEmail: order.store.supportEmail,
      }),
    });
  });
}

/** A payment arrived: the customer's confirmation (unless sent when they submitted a bank payment), the merchant, each supplier. */
export async function notifyOrderPaid(orderId: string, oversold: string[] = []): Promise<void> {
  await notifyOrderConfirmed(orderId);
  await safely("the new-order emails", async () => {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        store: { include: { owner: true } },
        items: true,
        fulfillments: { include: { supplier: { include: { user: true } }, items: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return;
    await queueEmail({
      key: `merchant-new-order:${order.id}`,
      kind: "merchant_new_order",
      orderId: order.id,
      to: [order.store.owner.email],
      fromName: PLATFORM_BRAND.name,
      content: merchantNewOrderEmail({
        storeName: order.store.name,
        orderNumber: order.number,
        customerName: order.name,
        country: order.country,
        items: order.items,
        total: order.total,
        parcels: order.fulfillments.length,
        orderUrl: `${appUrl()}/merchant/orders/${order.id}`,
      }),
    });
    for (const f of order.fulfillments) {
      await queueEmail({
        key: `supplier-new-order:${f.id}`,
        kind: "supplier_new_order",
        orderId: order.id,
        to: [f.supplier.user.email],
        fromName: PLATFORM_BRAND.name,
        content: supplierNewOrderEmail({
          supplierName: f.supplier.companyName,
          orderNumber: order.number,
          items: f.items,
          shipToCity: order.city,
          shipToCountry: order.country,
          processingDays: f.supplier.processingDays,
          dashboardUrl: `${appUrl()}/supplier/orders`,
        }),
      });
    }
  });
  if (oversold.length > 0) {
    await notifyAdmins({
      kind: "oversold",
      orderId,
      title: "Not enough stock for a paid order",
      message: `The payment arrived after the stock hold ended, and these items ran short: ${oversold.join(", ")}. Check with the suppliers, or refund the order.`,
    });
  }
}

/**
 * A payment failed or expired. Only customers who were told their order was placed hear about it (a bank payment that
 * was submitted, then refused): someone who left the payment page knows they did not pay.
 */
export async function notifyPaymentFailed(orderId: string): Promise<void> {
  await safely("the payment-failed email", async () => {
    if (!(await db.emailLog.findUnique({ where: { key: confirmationKey(orderId) }, select: { id: true } }))) return;
    const order = await db.order.findUnique({ where: { id: orderId }, include: { store: true } });
    if (!order) return;
    await queueEmail({
      key: `payment-failed:${order.id}`,
      kind: "payment_failed",
      orderId: order.id,
      to: [order.email],
      fromName: order.store.name,
      replyTo: order.store.supportEmail,
      content: paymentFailedEmail({
        brand: storeBrand(order.store),
        orderNumber: order.number,
        customerName: order.name,
        total: order.total,
        shopUrl: `${appUrl()}/s/${order.store.slug}`,
        supportEmail: order.store.supportEmail,
      }),
    });
  });
}

/** A full refund (the order is closed), or a partial one made in the Stripe Dashboard: `refundedSoFar` in total. */
export async function notifyRefund(orderId: string, refund: { full: true } | { full: false; refundedSoFar: number }): Promise<void> {
  await safely("the refund email", async () => {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { store: true } });
    if (!order) return;
    await queueEmail({
      key: `refund:${order.id}:${refund.full ? "full" : refund.refundedSoFar}`,
      kind: "refund",
      orderId: order.id,
      to: [order.email],
      fromName: order.store.name,
      replyTo: order.store.supportEmail,
      content: refundEmail({
        brand: storeBrand(order.store),
        orderNumber: order.number,
        customerName: order.name,
        amount: refund.full ? order.total : refund.refundedSoFar,
        full: refund.full,
        orderUrl: customerOrderUrl(order, order.store),
        supportEmail: order.store.supportEmail,
      }),
    });
  });
}

/** A supplier shipped its parcel, or corrected its tracking (a new tracking number sends a new email). */
export async function notifyParcelShipped(supplierOrderId: string): Promise<void> {
  await safely("the shipping email", async () => {
    const f = await db.supplierOrder.findUnique({
      where: { id: supplierOrderId },
      include: { items: true, order: { include: { store: true, fulfillments: true } } },
    });
    if (!f || !f.carrier || !f.trackingNumber) return;
    const { order } = f;
    const parcels = order.fulfillments.filter((x) => x.status !== "CANCELLED");
    const announced = await db.emailLog.findFirst({ where: { key: { startsWith: `parcel-shipped:${f.id}:` } }, select: { id: true } });
    await queueEmail({
      key: `parcel-shipped:${f.id}:${f.trackingNumber}`,
      kind: "parcel_shipped",
      orderId: order.id,
      to: [order.email],
      fromName: order.store.name,
      replyTo: order.store.supportEmail,
      content: parcelShippedEmail({
        brand: storeBrand(order.store),
        orderNumber: order.number,
        customerName: order.name,
        carrier: f.carrier,
        trackingNumber: f.trackingNumber,
        trackingUrl: f.trackingUrl,
        items: f.items,
        shipped: parcels.filter((x) => x.status === "SHIPPED" || x.status === "DELIVERED").length,
        parcels: parcels.length,
        isUpdate: Boolean(announced),
        orderUrl: customerOrderUrl(order, order.store),
        supportEmail: order.store.supportEmail,
      }),
    });
  });
}

/** The customer asked to return an order: a receipt for them, and the request for the merchant. */
export async function notifyReturnRequested(returnId: string): Promise<void> {
  await safely("the return-request emails", async () => {
    const ret = await db.returnRequest.findUnique({ where: { id: returnId }, include: { order: { include: { store: { include: { owner: true } } } } } });
    if (!ret) return;
    const { order } = ret;
    await queueEmail({
      key: `return-received:${ret.id}`,
      kind: "return_received",
      orderId: order.id,
      to: [order.email],
      fromName: order.store.name,
      replyTo: order.store.supportEmail,
      content: returnReceivedEmail({
        brand: storeBrand(order.store),
        orderNumber: order.number,
        customerName: order.name,
        reason: ret.reason,
        orderUrl: customerOrderUrl(order, order.store),
        supportEmail: order.store.supportEmail,
      }),
    });
    await queueEmail({
      key: `merchant-return:${ret.id}`,
      kind: "merchant_return",
      orderId: order.id,
      to: [order.store.owner.email],
      fromName: PLATFORM_BRAND.name,
      content: merchantReturnEmail({
        orderNumber: order.number,
        customerName: order.name,
        reason: ret.reason,
        details: ret.details,
        orderUrl: `${appUrl()}/merchant/orders/${order.id}`,
      }),
    });
  });
}

/** The merchant approved or rejected a return. A return closed with a refund is announced by the refund email instead. */
export async function notifyReturnResolved(returnId: string): Promise<void> {
  await safely("the return-decision email", async () => {
    const ret = await db.returnRequest.findUnique({ where: { id: returnId }, include: { order: { include: { store: true } } } });
    if (!ret || (ret.status !== "APPROVED" && ret.status !== "REJECTED")) return;
    const { order } = ret;
    await queueEmail({
      key: `return-${ret.status.toLowerCase()}:${ret.id}`,
      kind: "return_resolved",
      orderId: order.id,
      to: [order.email],
      fromName: order.store.name,
      replyTo: order.store.supportEmail,
      content: returnResolvedEmail({
        brand: storeBrand(order.store),
        orderNumber: order.number,
        customerName: order.name,
        approved: ret.status === "APPROVED",
        message: ret.resolution,
        orderUrl: customerOrderUrl(order, order.store),
        supportEmail: order.store.supportEmail,
      }),
    });
  });
}

/** A payment problem staff must act on, sent to every active admin. `ref` tells apart several of one kind on one order. */
export async function notifyAdmins(alert: {
  kind: "payment_review" | "oversold" | "refund_failed" | "dispute";
  orderId: string;
  ref?: string | null;
  title: string;
  message: string;
}): Promise<void> {
  await safely("the admin alert", async () => {
    const [order, admins] = await Promise.all([
      db.order.findUnique({ where: { id: alert.orderId }, select: { id: true, number: true } }),
      db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } }),
    ]);
    if (!order) return;
    await queueEmail({
      key: `admin-alert:${alert.kind}:${order.id}${alert.ref ? `:${alert.ref}` : ""}`,
      kind: "admin_alert",
      orderId: order.id,
      to: admins.map((a) => a.email),
      fromName: PLATFORM_BRAND.name,
      content: adminAlertEmail({ title: alert.title, orderNumber: order.number, message: alert.message, orderUrl: `${appUrl()}/admin/orders/${order.id}` }),
    });
  });
}
