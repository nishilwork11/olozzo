import "server-only";
import { CjError } from "./client";
import { logCj } from "./log";
import { cjDetail } from "./products";
import { usdToEurCents } from "./fx";
import { db } from "@/lib/db";

// Scheduled catalogue sync for imported CJ products (run from /api/cron/cj).
// Conservative on purpose: it refreshes the supplier COST (costPrice) and marks products
// that CJ has removed, but never rewrites the retail price — merchants own retail.

export async function syncCjCatalog(limit = 25): Promise<{ checked: number; updated: number; removed: number }> {
  // Oldest-synced first so every product is refreshed in turn.
  const rows = await db.cjProduct.findMany({
    where: { syncStatus: { not: "REMOVED" } },
    orderBy: { lastSyncedAt: "asc" },
    take: limit,
  });

  let updated = 0;
  let removed = 0;
  for (const row of rows) {
    try {
      const detail = await cjDetail(row.cjPid);
      const priceMatch = String(detail.sellPrice ?? "").match(/\d+(\.\d+)?/);
      const baseCost = usdToEurCents(priceMatch ? Number(priceMatch[0]) : 0);
      if (baseCost > 0) {
        await db.product.update({ where: { id: row.productId }, data: { costPrice: baseCost } }).catch(() => {});
        updated++;
      }
      await db.cjProduct.update({
        where: { id: row.id },
        data: { lastSyncedAt: new Date(), syncStatus: "OK", raw: detail as object },
      });
    } catch (err) {
      // CJ "not found" → the product was delisted; hide it and stop reselling.
      const notFound = err instanceof CjError && /not\s*found|does not exist|已下架|removed/i.test(err.message);
      if (notFound) {
        removed++;
        await db.cjProduct.update({ where: { id: row.id }, data: { syncStatus: "REMOVED", lastSyncedAt: new Date() } });
        await db.product.update({ where: { id: row.productId }, data: { active: false } }).catch(() => {});
        await db.storeProduct.updateMany({ where: { productId: row.productId }, data: { active: false } });
        await logCj("catalog-sync", "WARN", `CJ product ${row.cjPid} removed; product deactivated`, { refId: row.productId });
      } else {
        await db.cjProduct.update({ where: { id: row.id }, data: { syncStatus: "ERROR", lastSyncedAt: new Date() } }).catch(() => {});
        const msg = err instanceof Error ? err.message : "sync failed";
        await logCj("catalog-sync", "ERROR", `Sync failed for ${row.cjPid}: ${msg}`, { refId: row.productId });
      }
    }
  }
  return { checked: rows.length, updated, removed };
}
