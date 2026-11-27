import "server-only";
import type { Prisma } from "@prisma/client";
import { bbGet } from "./client";
import { logBigBuy } from "./log";
import { db } from "@/lib/db";

// BigBuy catalogue pull + local snapshot.
//
// BigBuy serves its catalogue in bulk, one first-level taxonomy at a time, and has NO
// keyword-search endpoint. So we pull each taxonomy's products + text + images + variations
// + stock, merge them by product id, and upsert a BigBuyCatalogItem row per product. The
// admin browse/search/import then read that snapshot (fast, no live calls, no rate-limit risk).
//
// BigBuy's own guidance: refresh catalogue text/images every 8–24h, stock every 10–15 min.

const DEFAULT_LANG = (process.env.BIGBUY_LANG || "en").toLowerCase();

// ── response shapes (defensive: BigBuy fields vary, so most are optional) ──────
type BbProduct = {
  id: number;
  sku: string;
  ean13?: string;
  wholesalePrice?: number;
  retailPrice?: number;
  taxRate?: number;
  weight?: number; // kilograms
  active?: number | boolean;
  condition?: string;
  attributes?: boolean; // whether the product has attribute-based variations
  manufacturer?: number;
};
type BbInfo = { id: number; sku?: string; name?: string; description?: string };
type BbImageRow = { id: number; images?: { url?: string; isCover?: boolean | string }[] };
type BbVariation = { id: number; sku: string; product: number; wholesalePrice?: number; retailPrice?: number; ean13?: string; extraWeight?: number };
type BbStockRow = { id: number; sku?: string; stocks?: { quantity?: number }[] };

export type BbTaxonomy = { id: number; name: string; parentTaxonomy?: number | null; isoCode?: string };

// ── helpers ────────────────────────────────────────────────────────────────────

function eurToCents(eur: number | undefined): number {
  if (!Number.isFinite(eur ?? NaN) || (eur ?? 0) <= 0) return 0;
  return Math.round((eur as number) * 100);
}

function kgToGrams(kg: number | undefined): number {
  const g = Math.round((kg ?? 0) * 1000);
  return g > 0 ? g : 500;
}

function totalStock(row: BbStockRow | undefined): number {
  if (!row?.stocks) return 0;
  return row.stocks.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
}

/** BigBuy descriptions are HTML; the storefront renders descriptions as plain text (like CJ). */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\s*img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#3[49];/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── taxonomies ───────────────────────────────────────────────────────────────

export async function bbTaxonomies(opts: { firstLevel?: boolean } = {}): Promise<BbTaxonomy[]> {
  const data = await bbGet<BbTaxonomy[]>("/rest/catalog/taxonomies.json", { firstLevel: opts.firstLevel });
  return Array.isArray(data) ? data : [];
}

// ── the merged snapshot shape stored in BigBuyCatalogItem.raw (import reads this) ──
export type BbMergedVariation = { bbVariation: number; sku: string; costCents: number; stock: number; weightGrams: number };
export type BbMerged = {
  name: string;
  description: string;
  images: string[];
  variations: BbMergedVariation[];
};

/**
 * Pull one first-level taxonomy and upsert its products into BigBuyCatalogItem.
 * Returns how many items were written. Text + images are language-specific (DEFAULT_LANG).
 */
export async function syncBigBuyTaxonomy(parentTaxonomy: number): Promise<{ taxonomy: number; items: number }> {
  const [products, info, images, variations, stock, variationStock] = await Promise.all([
    bbGet<BbProduct[]>("/rest/catalog/products.json", { parentTaxonomy }),
    bbGet<BbInfo[]>("/rest/catalog/productsinformation.json", { isoCode: DEFAULT_LANG, parentTaxonomy }),
    bbGet<BbImageRow[]>("/rest/catalog/productsimages.json", { parentTaxonomy }),
    bbGet<BbVariation[]>("/rest/catalog/productsvariations.json", { parentTaxonomy }),
    bbGet<BbStockRow[]>("/rest/catalog/productsstockbyhandlingdays.json", { parentTaxonomy }),
    bbGet<BbStockRow[]>("/rest/catalog/productsvariationsstockbyhandlingdays.json", { parentTaxonomy }).catch(() => [] as BbStockRow[]),
  ]);

  const infoById = new Map((info ?? []).map((r) => [r.id, r]));
  const imagesById = new Map((images ?? []).map((r) => [r.id, r]));
  const stockById = new Map((stock ?? []).map((r) => [r.id, r]));
  const variationStockById = new Map((variationStock ?? []).map((r) => [r.id, r]));

  const variationsByProduct = new Map<number, BbVariation[]>();
  for (const v of variations ?? []) {
    variationsByProduct.set(v.product, [...(variationsByProduct.get(v.product) ?? []), v]);
  }

  let count = 0;
  for (const p of products ?? []) {
    const text = infoById.get(p.id);
    const imgRow = imagesById.get(p.id);
    const imgs = (imgRow?.images ?? [])
      .slice()
      .sort((a, b) => (isCover(b.isCover) ? 1 : 0) - (isCover(a.isCover) ? 1 : 0))
      .map((i) => i.url)
      .filter((u): u is string => Boolean(u));

    const baseWeight = kgToGrams(p.weight);
    const pv = variationsByProduct.get(p.id) ?? [];
    const mergedVariations: BbMergedVariation[] = pv.map((v) => ({
      bbVariation: v.id,
      sku: v.sku,
      costCents: eurToCents(v.wholesalePrice) || eurToCents(p.wholesalePrice),
      stock: totalStock(variationStockById.get(v.id)),
      weightGrams: baseWeight + Math.round((v.extraWeight ?? 0) * 1000),
    }));

    const costCents = mergedVariations.length
      ? Math.min(...mergedVariations.map((v) => v.costCents).filter((c) => c > 0), eurToCents(p.wholesalePrice) || Infinity)
      : eurToCents(p.wholesalePrice);
    const stockTotal = mergedVariations.length
      ? mergedVariations.reduce((s, v) => s + v.stock, 0)
      : totalStock(stockById.get(p.id));

    const merged: BbMerged = {
      name: text?.name?.trim() || p.sku,
      description: htmlToText(text?.description || "") || (text?.name ?? p.sku),
      images: imgs,
      variations: mergedVariations,
    };

    await db.bigBuyCatalogItem.upsert({
      where: { bbId: p.id },
      create: {
        bbId: p.id,
        bbSku: p.sku,
        name: merged.name,
        description: merged.description,
        costCents: Number.isFinite(costCents) ? costCents : 0,
        taxRate: p.taxRate ?? 0,
        image: imgs[0] ?? null,
        images: JSON.stringify(imgs),
        parentTaxonomy,
        stock: stockTotal,
        weightGrams: baseWeight,
        active: isActive(p.active),
        condition: p.condition ?? "NEW",
        hasVariations: mergedVariations.length > 0,
        raw: merged as unknown as Prisma.InputJsonValue,
        lastSeenAt: new Date(),
      },
      update: {
        bbSku: p.sku,
        name: merged.name,
        description: merged.description,
        costCents: Number.isFinite(costCents) ? costCents : 0,
        taxRate: p.taxRate ?? 0,
        image: imgs[0] ?? null,
        images: JSON.stringify(imgs),
        parentTaxonomy,
        stock: stockTotal,
        weightGrams: baseWeight,
        active: isActive(p.active),
        condition: p.condition ?? "NEW",
        hasVariations: mergedVariations.length > 0,
        raw: merged as unknown as Prisma.InputJsonValue,
        lastSeenAt: new Date(),
      },
    });
    count++;
  }

  await logBigBuy("catalog-sync", "INFO", `Taxonomy ${parentTaxonomy}: cached ${count} products`, { refId: String(parentTaxonomy) });
  return { taxonomy: parentTaxonomy, items: count };
}

function isCover(v: boolean | string | undefined): boolean {
  return v === true || String(v).toUpperCase() === "TRUE";
}
function isActive(v: number | boolean | undefined): boolean {
  return v === 1 || v === true;
}

// ── admin browse (reads the snapshot, not the API) ─────────────────────────────

export type BbBrowseItem = { bbId: number; bbSku: string; name: string; costCents: number; image: string | null; stock: number; active: boolean };

export async function bbBrowse(opts: { keyword?: string; taxonomy?: number; page?: number; pageSize?: number }): Promise<{ items: BbBrowseItem[]; total: number }> {
  const pageSize = Math.min(60, Math.max(1, opts.pageSize ?? 24));
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.BigBuyCatalogItemWhereInput = {};
  if (opts.taxonomy) where.parentTaxonomy = opts.taxonomy;
  if (opts.keyword) {
    where.OR = [
      { name: { contains: opts.keyword, mode: "insensitive" } },
      { bbSku: { contains: opts.keyword, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.bigBuyCatalogItem.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.bigBuyCatalogItem.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({ bbId: r.bbId, bbSku: r.bbSku, name: r.name, costCents: r.costCents, image: r.image, stock: r.stock, active: r.active })),
    total,
  };
}
