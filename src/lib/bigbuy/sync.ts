import "server-only";
import type { BbMerged } from "./catalog";
import { syncBigBuyTaxonomy } from "./catalog";
import { logBigBuy } from "./log";
import { db } from "@/lib/db";

// Scheduled catalogue sync for imported BigBuy products (run from /api/cron/bigbuy).
// Conservative on purpose (same policy as the CJ sync): it refreshes supplier COST and stock
// and deactivates products BigBuy has removed, but never rewrites the retail price — merchants
// own retail.
//
// BigBuy has no per-product endpoint, so we refresh the cached snapshot for the taxonomies that
// contain imported products, then propagate cost + stock from the snapshot to the live products.

export async function syncBigBuyCatalog(limit = 25): Promise<{ checked: number; updated: number; removed: number }> {
  // Oldest-synced imported products first, so every product is refreshed in turn.
  const rows = await db.bigBuyProduct.findMany({
    where: { syncStatus: { not: "REMOVED" } },
    orderBy: { lastSyncedAt: "asc" },
    take: limit,
  });
  if (rows.length === 0) return { checked: 0, updated: 0, removed: 0 };

  // Refresh the snapshot once per distinct taxonomy covered by this batch.
  const taxonomies = [...new Set(rows.map((r) => r.parentTaxonomy).filter((t): t is number => typeof t === "number"))];
  for (const t of taxonomies) {
    try {
      await syncBigBuyTaxonomy(t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "taxonomy sync failed";
      await logBigBuy("catalog-sync", "ERROR", `Snapshot refresh failed for taxonomy ${t}: ${msg}`, { refId: String(t) });
    }
  }

  let updated = 0;
  let removed = 0;
  for (const row of rows) {
    try {
      const item = await db.bigBuyCatalogItem.findUnique({ where: { bbSku: row.bbSku } });

      // Gone from the latest snapshot, or flagged inactive → BigBuy delisted it. Stop reselling.
      if (!item || !item.active) {
        removed++;
        await db.bigBuyProduct.update({ where: { id: row.id }, data: { syncStatus: "REMOVED", lastSyncedAt: new Date() } });
        await db.product.update({ where: { id: row.productId }, data: { active: false } }).catch(() => {});
        await db.storeProduct.updateMany({ where: { productId: row.productId }, data: { active: false } });
        await logBigBuy("catalog-sync", "WARN", `BigBuy product ${row.bbSku} removed/inactive; product deactivated`, { refId: row.productId });
        continue;
      }

      // Refresh supplier cost (never retail).
      if (item.costCents > 0) {
        await db.product.update({ where: { id: row.productId }, data: { costPrice: item.costCents } }).catch(() => {});
      }

      // Refresh per-variant stock from the snapshot's merged variations.
      const merged = (item.raw ?? null) as BbMerged | null;
      const stockBySku = new Map((merged?.variations ?? []).map((v) => [v.sku, v.stock]));
      const maps = await db.bigBuyVariant.findMany({ where: { variantId: { in: await variantIds(row.productId) } } });
      let totalStock = 0;
      for (const m of maps) {
        const stock = stockBySku.has(m.bbSku) ? Math.max(0, stockBySku.get(m.bbSku)!) : item.stock;
        totalStock += stock;
        await db.productVariant.update({ where: { id: m.variantId }, data: { stock } }).catch(() => {});
      }

      await db.bigBuyProduct.update({
        where: { id: row.id },
        data: { lastSyncedAt: new Date(), syncStatus: totalStock > 0 ? "OK" : "STOCK_OUT" },
      });
      updated++;
    } catch (err) {
      await db.bigBuyProduct.update({ where: { id: row.id }, data: { syncStatus: "ERROR", lastSyncedAt: new Date() } }).catch(() => {});
      const msg = err instanceof Error ? err.message : "sync failed";
      await logBigBuy("catalog-sync", "ERROR", `Sync failed for ${row.bbSku}: ${msg}`, { refId: row.productId });
    }
  }
  return { checked: rows.length, updated, removed };
}

async function variantIds(productId: string): Promise<string[]> {
  const vs = await db.productVariant.findMany({ where: { productId }, select: { id: true } });
  return vs.map((v) => v.id);
}
