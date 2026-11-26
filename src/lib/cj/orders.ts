import "server-only";
import { cjGet, cjPost } from "./client";
import { CJ_SUPPLIER_EMAIL } from "./products";
import { logCj } from "./log";
import { trackingUrlFor } from "@/lib/carriers";
import { db } from "@/lib/db";
import { notifyParcelShipped } from "@/lib/email/notify";

// Order push & tracking sync for CJ-fulfilled SupplierOrders. Run from /api/cron/cj.
//
// IMPORTANT: a CJ order is created UNPAID and is funded from your prepaid CJ wallet.
// Whether the wallet charge can be triggered via API is unconfirmed (see the plan), so this
// code creates the order and flags it for payment; it never invents a payment call.

/** CJ virtual supplier id, or null if nothing has been imported yet. */
export async function cjSupplierId(): Promise<string | null> {
  const s = await db.supplier.findFirst({ where: { user: { email: CJ_SUPPLIER_EMAIL } }, select: { id: true } });
  return s?.id ?? null;
}

type CreateOrderResp = { orderId?: string; orderNum?: string } | string;

/**
 * Forward not-yet-pushed CJ fulfilments to CJ via createOrderV2.
 * Idempotent: only acts on SupplierOrders with no cjOrderId, and stamps the id atomically.
 */
export async function pushPendingCjOrders(limit = 20): Promise<{ pushed: number; failed: number }> {
  const supplierId = await cjSupplierId();
  if (!supplierId) return { pushed: 0, failed: 0 };

  const pending = await db.supplierOrder.findMany({
    where: { supplierId, cjOrderId: null, status: { in: ["PENDING", "ACCEPTED"] } },
    include: { order: true, items: true },
    take: limit,
  });

  let pushed = 0;
  let failed = 0;
  for (const so of pending) {
    try {
      // Map each line item's Olozzo variant to its CJ variant id.
      const variantIds = so.items.map((i) => i.variantId).filter((v): v is string => Boolean(v));
      const maps = await db.cjVariant.findMany({ where: { variantId: { in: variantIds } } });
      const vidOf = new Map(maps.map((m) => [m.variantId, m.cjVid]));
      const products = so.items
        .map((i) => ({ vid: i.variantId ? vidOf.get(i.variantId) : undefined, quantity: i.quantity }))
        .filter((p): p is { vid: string; quantity: number } => Boolean(p.vid));

      if (products.length === 0) {
        await logCj("order-push", "WARN", `No CJ variant mapping for fulfilment ${so.id}; skipped`, { refId: so.id });
        failed++;
        continue;
      }

      const o = so.order;
      const payload = {
        orderNumber: `${o.number}-${so.id.slice(-6)}`,
        shippingCustomerName: o.name,
        shippingPhone: o.phone ?? "",
        shippingCountryCode: o.country,
        shippingProvince: "",
        shippingCity: o.city,
        shippingAddress: [o.addressLine1, o.addressLine2].filter(Boolean).join(", "),
        shippingZip: o.postalCode,
        email: o.email,
        fromCountryCode: "CN",
        products,
      };

      const resp = await cjPost<CreateOrderResp>("/shopping/order/createOrderV2", payload);
      const cjOrderId = typeof resp === "string" ? resp : (resp.orderId ?? resp.orderNum ?? "");
      if (!cjOrderId) {
        await logCj("order-push", "ERROR", `CJ returned no order id for fulfilment ${so.id}`, { refId: so.id });
        failed++;
        continue;
      }

      // Stamp atomically; a concurrent run that already stamped it changes nothing.
      const claimed = await db.supplierOrder.updateMany({
        where: { id: so.id, cjOrderId: null },
        data: { cjOrderId, cjOrderStatus: "CREATED", cjPaymentStatus: "UNPAID_PENDING_WALLET" },
      });
      if (claimed.count > 0) {
        pushed++;
        await logCj("order-push", "INFO", `CJ order ${cjOrderId} created (UNPAID — pay from CJ wallet)`, { refId: so.id });
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "order push failed";
      await logCj("order-push", "ERROR", `Push failed for fulfilment ${so.id}: ${msg}`, { refId: so.id });
    }
  }
  return { pushed, failed };
}

type OrderDetailResp = { orderStatus?: string; trackNumber?: string; logisticName?: string };

/** Fallback tracking page for carriers Olozzo does not have a direct URL for. */
function cjTrackingUrl(carrier: string, trackingNumber: string): string {
  return trackingUrlFor(carrier, trackingNumber) ?? `https://t.17track.net/en#nums=${encodeURIComponent(trackingNumber)}`;
}

/**
 * Pull CJ order status/tracking for open CJ fulfilments. When a tracking number first
 * appears, mark the fulfilment SHIPPED and send the customer the shipping email.
 */
export async function syncCjTracking(limit = 30): Promise<{ updated: number; shipped: number }> {
  const supplierId = await cjSupplierId();
  if (!supplierId) return { updated: 0, shipped: 0 };

  const open = await db.supplierOrder.findMany({
    where: { supplierId, cjOrderId: { not: null }, status: { in: ["PENDING", "ACCEPTED", "SHIPPED"] } },
    take: limit,
  });

  let updated = 0;
  let shipped = 0;
  for (const so of open) {
    try {
      const detail = await cjGet<OrderDetailResp>("/shopping/order/getOrderDetail", { orderId: so.cjOrderId! });
      const track = detail.trackNumber?.trim();
      const carrier = detail.logisticName?.trim() || "CJ";

      if (track && so.status !== "SHIPPED" && so.status !== "DELIVERED") {
        await db.supplierOrder.update({
          where: { id: so.id },
          data: {
            status: "SHIPPED",
            carrier,
            trackingNumber: track,
            trackingUrl: cjTrackingUrl(carrier, track),
            shippedAt: new Date(),
            cjOrderStatus: detail.orderStatus ?? "SHIPPED",
          },
        });
        shipped++;
        await notifyParcelShipped(so.id);
        await logCj("track-sync", "INFO", `Tracking ${track} (${carrier}) added for fulfilment ${so.id}`, { refId: so.id });
      } else if (detail.orderStatus && detail.orderStatus !== so.cjOrderStatus) {
        await db.supplierOrder.update({ where: { id: so.id }, data: { cjOrderStatus: detail.orderStatus } });
        updated++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "track sync failed";
      await logCj("track-sync", "ERROR", `Tracking sync failed for fulfilment ${so.id}: ${msg}`, { refId: so.id });
    }
  }
  return { updated, shipped };
}
