import "server-only";
import { bbGet, bbPost, BigBuyError } from "./client";
import { logBigBuy } from "./log";
import { BIGBUY_SUPPLIER_EMAIL } from "./products";
import { trackingUrlFor } from "@/lib/carriers";
import { db } from "@/lib/db";
import { notifyParcelShipped } from "@/lib/email/notify";

// Order push & tracking sync for BigBuy-fulfilled SupplierOrders. Run from /api/cron/bigbuy.
//
// Push uses BigBuy's two-step flow, both documented in the official guide:
//   1. POST /rest/order/check/multishipping.json   — validate, returns totals, does NOT create
//   2. POST /rest/order/create/multishipping.json  — creates the order
//
// IMPORTANT: like the CJ supplier, a BigBuy order is created and then funded from your prepaid
// BigBuy balance. Whether that balance charge can be triggered via API is unconfirmed, so this
// code creates the order and flags it for funding; it never invents a payment call.
//
// Tracking/order-status endpoints are NOT in the official guide, so they are gated behind
// BIGBUY_TRACKING_ENABLED and isolated in getBigBuyOrderStatus() — confirm the paths against
// api.bigbuy.eu/rest/doc, then flip the flag on.

/** BigBuy virtual supplier id, or null if nothing has been imported yet. */
export async function bigBuySupplierId(): Promise<string | null> {
  const s = await db.supplier.findFirst({ where: { user: { email: BIGBUY_SUPPLIER_EMAIL } }, select: { id: true } });
  return s?.id ?? null;
}

type CheckResponse = { orders?: { total?: number; warehouse?: number }[]; errors?: { status?: number; code?: string; message?: string }[] };
type CreateResponse = { orders?: { id?: string | number; warehouse?: number; url?: string }[]; errors?: { status?: number; code?: string; message?: string; productReferences?: string[] }[] };

function carriersFromEnv(): { name: string }[] | undefined {
  const raw = process.env.BIGBUY_CARRIERS?.trim();
  if (!raw) return undefined; // omit → BigBuy chooses the cheapest allowed carrier
  return raw.split(",").map((c) => ({ name: c.trim().toLowerCase() })).filter((c) => c.name);
}

/**
 * Forward not-yet-pushed BigBuy fulfilments to BigBuy (check then create).
 * Idempotent: only acts on SupplierOrders with no bigBuyOrderId, uses the fulfilment id as
 * BigBuy's internalReference, and stamps the id atomically so a concurrent run cannot double-push.
 */
export async function pushPendingBigBuyOrders(limit = 20): Promise<{ pushed: number; failed: number }> {
  const supplierId = await bigBuySupplierId();
  if (!supplierId) return { pushed: 0, failed: 0 };

  const pending = await db.supplierOrder.findMany({
    where: { supplierId, bigBuyOrderId: null, status: { in: ["PENDING", "ACCEPTED"] } },
    include: { order: true, items: true },
    take: limit,
  });

  let pushed = 0;
  let failed = 0;
  for (const so of pending) {
    try {
      // Map each line item's Olozzo variant to its BigBuy reference (SKU).
      const variantIds = so.items.map((i) => i.variantId).filter((v): v is string => Boolean(v));
      const maps = await db.bigBuyVariant.findMany({ where: { variantId: { in: variantIds } } });
      const skuOf = new Map(maps.map((m) => [m.variantId, m.bbSku]));
      const products = so.items
        .map((i) => ({ reference: i.variantId ? skuOf.get(i.variantId) : undefined, quantity: i.quantity }))
        .filter((p): p is { reference: string; quantity: number } => Boolean(p.reference));

      if (products.length === 0) {
        await logBigBuy("order-push", "WARN", `No BigBuy reference mapping for fulfilment ${so.id}; skipped`, { refId: so.id });
        failed++;
        continue;
      }

      const o = so.order;
      const payload = {
        order: {
          internalReference: so.id, // our fulfilment id = BigBuy's idempotency reference
          language: (process.env.BIGBUY_LANG || "en").toLowerCase(),
          paymentMethod: process.env.BIGBUY_PAYMENT_METHOD || "moneybox", // prepaid balance
          ...(carriersFromEnv() ? { carriers: carriersFromEnv() } : {}),
          shippingAddress: {
            firstName: o.name.split(" ")[0] || o.name,
            lastName: o.name.split(" ").slice(1).join(" ") || o.name,
            country: o.country,
            postcode: o.postalCode,
            town: o.city,
            address: [o.addressLine1, o.addressLine2].filter(Boolean).join(", "),
            phone: o.phone ?? "",
            email: o.email,
            comment: "",
          },
          products,
        },
      };

      // Step 1 — validate. Never create if the check reports errors.
      const check = await bbPost<CheckResponse>("/rest/order/check/multishipping.json", payload);
      if (check.errors && check.errors.length > 0) {
        const msg = check.errors.map((e) => e.message).join("; ");
        await logBigBuy("order-check", "ERROR", `Check failed for fulfilment ${so.id}: ${msg}`, { refId: so.id, data: check as object });
        failed++;
        continue;
      }

      // Step 2 — create.
      const created = await bbPost<CreateResponse>("/rest/order/create/multishipping.json", payload);
      const first = created.orders?.[0];
      const bigBuyOrderId = first?.id != null ? String(first.id) : "";
      if (!bigBuyOrderId) {
        const msg = created.errors?.map((e) => e.message).join("; ") || "BigBuy returned no order id";
        await logBigBuy("order-push", "ERROR", `Create failed for fulfilment ${so.id}: ${msg}`, { refId: so.id, data: created as object });
        failed++;
        continue;
      }
      if ((created.orders?.length ?? 0) > 1) {
        // Multi-warehouse: BigBuy split the request into several orders. We record the first id and
        // log the rest — one SupplierOrder maps to one bigBuyOrderId in the current model.
        await logBigBuy("order-push", "WARN", `Fulfilment ${so.id} split across ${created.orders!.length} BigBuy orders; recorded ${bigBuyOrderId}`, { refId: so.id, data: created as object });
      }

      // Stamp atomically; a concurrent run that already stamped it changes nothing.
      const claimed = await db.supplierOrder.updateMany({
        where: { id: so.id, bigBuyOrderId: null },
        data: {
          bigBuyOrderId,
          bigBuyOrderStatus: "CREATED",
          bigBuyPaymentStatus: "UNPAID_PENDING_BALANCE",
          bigBuyWarehouse: first?.warehouse ?? null,
        },
      });
      if (claimed.count > 0) {
        pushed++;
        await logBigBuy("order-push", "INFO", `BigBuy order ${bigBuyOrderId} created (fund from prepaid balance)`, { refId: so.id });
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "order push failed";
      await logBigBuy("order-push", "ERROR", `Push failed for fulfilment ${so.id}: ${msg}`, { refId: so.id });
    }
  }
  return { pushed, failed };
}

// ── tracking (gated — endpoints unconfirmed) ───────────────────────────────────

function trackingEnabled(): boolean {
  return String(process.env.BIGBUY_TRACKING_ENABLED ?? "").toLowerCase() === "true";
}

/**
 * ADAPTER — confirm the real paths against api.bigbuy.eu/rest/doc before enabling.
 * The order-create response returns `url: /rest/order/{id}`, so GET /rest/order/{id}.json is the
 * likely order-status route; tracking lives under /rest/tracking/*. Returns null on any failure
 * so the cron never breaks. Fill in the exact field names once confirmed.
 */
export async function getBigBuyOrderStatus(bigBuyOrderId: string): Promise<{ status?: string; carrier?: string; trackingNumber?: string } | null> {
  try {
    const detail = await bbGet<{ status?: string; carrier?: string; trackingNumber?: string; trackingNumbers?: { tracking?: string; carrier?: string }[] }>(
      `/rest/order/${encodeURIComponent(bigBuyOrderId)}.json`,
    );
    const t = detail.trackingNumbers?.[0];
    return {
      status: detail.status,
      carrier: detail.carrier ?? t?.carrier,
      trackingNumber: detail.trackingNumber ?? t?.tracking,
    };
  } catch (err) {
    if (err instanceof BigBuyError) return null;
    return null;
  }
}

/** Fallback tracking page for carriers Olozzo has no direct URL for. */
function bigBuyTrackingUrl(carrier: string, trackingNumber: string): string {
  return trackingUrlFor(carrier, trackingNumber) ?? `https://t.17track.net/en#nums=${encodeURIComponent(trackingNumber)}`;
}

/**
 * Pull BigBuy order status/tracking for open BigBuy fulfilments. When a tracking number first
 * appears, mark the fulfilment SHIPPED and send the customer the shipping email.
 * No-op until BIGBUY_TRACKING_ENABLED=true and getBigBuyOrderStatus() is confirmed.
 */
export async function syncBigBuyTracking(limit = 30): Promise<{ updated: number; shipped: number; skipped?: boolean }> {
  if (!trackingEnabled()) return { updated: 0, shipped: 0, skipped: true };
  const supplierId = await bigBuySupplierId();
  if (!supplierId) return { updated: 0, shipped: 0 };

  const open = await db.supplierOrder.findMany({
    where: { supplierId, bigBuyOrderId: { not: null }, status: { in: ["PENDING", "ACCEPTED", "SHIPPED"] } },
    take: limit,
  });

  let updated = 0;
  let shipped = 0;
  for (const so of open) {
    try {
      const detail = await getBigBuyOrderStatus(so.bigBuyOrderId!);
      if (!detail) continue;
      const track = detail.trackingNumber?.trim();
      const carrier = detail.carrier?.trim() || "BigBuy";

      if (track && so.status !== "SHIPPED" && so.status !== "DELIVERED") {
        await db.supplierOrder.update({
          where: { id: so.id },
          data: {
            status: "SHIPPED",
            carrier,
            trackingNumber: track,
            trackingUrl: bigBuyTrackingUrl(carrier, track),
            shippedAt: new Date(),
            bigBuyOrderStatus: detail.status ?? "SHIPPED",
          },
        });
        shipped++;
        await notifyParcelShipped(so.id);
        await logBigBuy("track-sync", "INFO", `Tracking ${track} (${carrier}) added for fulfilment ${so.id}`, { refId: so.id });
      } else if (detail.status && detail.status !== so.bigBuyOrderStatus) {
        await db.supplierOrder.update({ where: { id: so.id }, data: { bigBuyOrderStatus: detail.status } });
        updated++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "track sync failed";
      await logBigBuy("track-sync", "ERROR", `Tracking sync failed for fulfilment ${so.id}: ${msg}`, { refId: so.id });
    }
  }
  return { updated, shipped };
}
