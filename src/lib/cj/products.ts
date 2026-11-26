import "server-only";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cjGet } from "./client";
import { usdToEurCents } from "./fx";
import { logCj } from "./log";
import { HOUSE_STORE_SLUG } from "@/lib/catalog";
import { db } from "@/lib/db";
import { retailFromCost } from "@/lib/pricing";
import { slugify } from "@/lib/utils";

// Reserved identity for the CJ "virtual supplier". All CJ-sourced products hang off it,
// so the whole existing supplier/fulfilment pipeline works unchanged.
export const CJ_SUPPLIER_EMAIL = "cj-dropshipping@olozzo.internal";
const CJ_SUPPLIER_COMPANY = "CJdropshipping";

// ── CJ response shapes ─────────────────────────────────────────────────────────
// Confirmed against the live listV2 response (Nov 2026): items are under `productList`,
// the id is `id`, name `nameEn`, image `bigImage`, price `sellPrice` (may be a range
// string like "0.56 -- 1.53"). Alternative names kept as fallbacks for the detail call.
type CjListItem = {
  id?: string;
  pid?: string;
  sku?: string;
  productSku?: string;
  nameEn?: string;
  productNameEn?: string;
  productName?: string;
  sellPrice?: string | number;
  bigImage?: string;
  productImage?: string;
};
type CjList = { productList?: CjListItem[]; list?: CjListItem[]; content?: CjListItem[]; total?: number };
type CjVariantRaw = {
  vid?: string;
  variantSku?: string;
  variantNameEn?: string;
  variantName?: string;
  variantKey?: string;
  variantSellPrice?: string | number;
  variantSugSellPrice?: string | number;
  variantWeight?: number;
};
type CjDetail = CjListItem & {
  description?: string;
  productImageSet?: string[] | string;
  variants?: CjVariantRaw[];
};
type CjCategory = { categoryFirstName?: string; categoryFirstList?: unknown };

/** Parse a price: handles plain "24.41", ranges "0.56 -- 1.53" (takes the low end) and numbers. */
function num(v: string | number | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const m = String(v ?? "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function nameOf(p: CjListItem): string {
  return p.nameEn ?? p.productNameEn ?? p.productName ?? "Untitled";
}

/** CJ descriptions are HTML (with embedded <img> tags). Convert to clean plain text,
 * since the storefront renders descriptions as text (consistent with manual suppliers). */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\s*img[^>]*>/gi, "") // drop embedded images (main gallery is imported separately)
    .replace(/<[^>]+>/g, "") // strip any remaining tags
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

/** Find the product array anywhere in a CJ response (it nests the array under varying keys). */
function pickItems(node: unknown, depth = 0): CjListItem[] {
  if (depth > 6 || node == null) return [];
  if (Array.isArray(node)) {
    const looksLikeProducts = node.some(
      (el) => el && typeof el === "object" && ("id" in el || "pid" in el) && ("nameEn" in el || "productNameEn" in el || "productName" in el),
    );
    if (looksLikeProducts) return node as CjListItem[];
    for (const el of node) {
      const found = pickItems(el, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = pickItems(v, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

/** CJ returns image lists as a JSON-encoded string ("[\"url\",…]"), an array, or a delimited string. */
function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("[")) {
      try {
        const a = JSON.parse(s);
        if (Array.isArray(a)) return a.filter((x): x is string => typeof x === "string");
      } catch {
        /* fall through */
      }
    }
    if (s) return s.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function imagesOf(d: CjDetail): string[] {
  const imgs = [...parseList(d.productImageSet), ...parseList(d.productImage)];
  const unique = [...new Set(imgs)];
  if (unique.length) return unique;
  return d.bigImage ? [d.bigImage] : [];
}

// ── catalogue browse ───────────────────────────────────────────────────────────

export async function cjCategories(): Promise<CjCategory[]> {
  const data = await cjGet<CjCategory[] | { list?: CjCategory[] }>("/product/getCategory");
  return Array.isArray(data) ? data : (data.list ?? []);
}

export type CjBrowseItem = { pid: string; sku: string; name: string; priceUsd: number; image: string | null };

export async function cjSearch(opts: { keyword?: string; categoryId?: string; page?: number; pageSize?: number }): Promise<{ items: CjBrowseItem[]; total: number }> {
  const data = await cjGet<unknown>("/product/listV2", {
    productNameEn: opts.keyword,
    categoryId: opts.categoryId,
    pageNum: opts.page ?? 1,
    pageSize: opts.pageSize ?? 20,
  });
  const items = pickItems(data)
    .map((p) => ({ item: p, pid: p.pid ?? p.id }))
    .filter((x): x is { item: CjListItem; pid: string } => Boolean(x.pid))
    .map(({ item, pid }) => ({
      pid,
      sku: item.sku ?? item.productSku ?? "",
      name: nameOf(item),
      priceUsd: num(item.sellPrice),
      image: item.bigImage ?? item.productImage ?? null,
    }));
  const meta = data as { totalRecords?: number; total?: number } | null;
  const total = meta?.totalRecords ?? meta?.total ?? items.length;
  return { items, total };
}

export async function cjDetail(pid: string): Promise<CjDetail> {
  return cjGet<CjDetail>("/product/query", { pid });
}

/** Variants come from a separate CJ endpoint (the detail call does not include them). */
export async function cjVariants(pid: string): Promise<CjVariantRaw[]> {
  const data = await cjGet<unknown>("/product/variant/query", { pid });
  if (Array.isArray(data)) return (data as CjVariantRaw[]).filter((v) => v && v.vid);
  return pickVariants(data);
}

function pickVariants(node: unknown, depth = 0): CjVariantRaw[] {
  if (depth > 5 || node == null) return [];
  if (Array.isArray(node)) {
    if (node.some((el) => el && typeof el === "object" && "vid" in el)) return (node as CjVariantRaw[]).filter((v) => v.vid);
    for (const el of node) {
      const f = pickVariants(el, depth + 1);
      if (f.length) return f;
    }
    return [];
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const f = pickVariants(v, depth + 1);
      if (f.length) return f;
    }
  }
  return [];
}

// Imported variants start sellable: CJ warehouses hold large stock and true availability
// is re-checked at fulfilment. Stock sync can refine this later.
const DEFAULT_IMPORT_STOCK = 999;

// ── virtual supplier ────────────────────────────────────────────────────────────

/** The CJ virtual supplier, created on first import. Idempotent. */
export async function ensureCjSupplier() {
  const existing = await db.supplier.findFirst({ where: { user: { email: CJ_SUPPLIER_EMAIL } } });
  if (existing) return existing;
  const user = await db.user.upsert({
    where: { email: CJ_SUPPLIER_EMAIL },
    update: {},
    create: {
      email: CJ_SUPPLIER_EMAIL,
      name: CJ_SUPPLIER_COMPANY,
      // Random hash: this account is API-only and cannot be logged into.
      passwordHash: await bcrypt.hash(`cj-${Date.now()}-${Math.random()}`, 10),
      role: "SUPPLIER",
      status: "ACTIVE",
    },
  });
  return db.supplier.create({
    data: {
      userId: user.id,
      companyName: CJ_SUPPLIER_COMPANY,
      country: "CN",
      description: "Automated CJdropshipping supplier. Products are imported and fulfilled via the CJ API.",
      status: "APPROVED",
    },
  });
}

// ── import ────────────────────────────────────────────────────────────────────

export type ImportResult = { ok: true; productId: string; storeProductId: string } | { ok: false; error: string };

/**
 * Import one CJ product into the catalogue and publish it to the house store.
 * Dedupes on CjProduct.cjPid, so importing the same product twice is a no-op.
 */
export async function importCjProduct(pid: string, opts: { markupPercent?: number } = {}): Promise<ImportResult> {
  const already = await db.cjProduct.findUnique({ where: { cjPid: pid } });
  if (already) return { ok: false, error: "This product has already been imported." };

  let detail: CjDetail;
  try {
    detail = await cjDetail(pid);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to fetch product from CJ";
    await logCj("import", "ERROR", `Import failed for ${pid}: ${error}`, { refId: pid });
    return { ok: false, error };
  }

  const supplier = await ensureCjSupplier();
  const house = await db.store.findUnique({ where: { slug: HOUSE_STORE_SLUG } });
  if (!house) return { ok: false, error: `House store "${HOUSE_STORE_SLUG}" not found. Seed the shop first.` };

  // Variants are a separate CJ call; tolerate failure (product may be single-variant).
  let rawVariants: CjVariantRaw[] = [];
  try {
    rawVariants = await cjVariants(pid);
  } catch {
    rawVariants = [];
  }

  const markup = opts.markupPercent ?? house.markupPercent;
  const title = nameOf(detail);
  const description = htmlToText(detail.description || "") || title;
  const baseSku = detail.productSku || detail.sku || `CJ-${pid}`;
  const images = imagesOf(detail);

  // Base cost = cheapest variant, falling back to the product's own sellPrice.
  const variantCostsUsd = rawVariants.map((v) => num(v.variantSellPrice)).filter((n) => n > 0);
  const baseCostUsd = variantCostsUsd.length ? Math.min(...variantCostsUsd) : num(detail.sellPrice);
  const baseCost = usdToEurCents(baseCostUsd);
  const weightGrams = rawVariants.find((v) => v.variantWeight && v.variantWeight > 0)?.variantWeight ?? 500;

  const variantData =
    rawVariants.length > 0
      ? rawVariants.map((v, i) => ({
          name: v.variantNameEn ?? v.variantName ?? v.variantKey ?? `Variant ${i + 1}`,
          sku: v.variantSku || `${baseSku}-${i + 1}`,
          costPrice: usdToEurCents(num(v.variantSellPrice)) || baseCost,
          stock: DEFAULT_IMPORT_STOCK,
          position: i,
        }))
      : [{ name: "Default", sku: baseSku, costPrice: baseCost, stock: DEFAULT_IMPORT_STOCK, position: 0 }];

  const retail = retailFromCost(baseCost, markup, house.priceEnding99);

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          supplierId: supplier.id,
          title,
          description,
          images: JSON.stringify(images),
          sku: baseSku,
          costPrice: baseCost,
          suggestedPrice: retail,
          shippingCost: 0, // real freight is quoted per-destination at checkout (see §6 of the plan)
          weightGrams,
          variants: { create: variantData },
        },
        include: { variants: true },
      });

      await tx.cjProduct.create({
        data: { productId: product.id, cjPid: pid, cjSku: baseSku, lastSyncedAt: new Date(), raw: detail as object },
      });

      // Map each created variant to its CJ variant (same order as variantData).
      for (let i = 0; i < product.variants.length; i++) {
        const cj = rawVariants[i];
        if (cj?.vid) {
          await tx.cjVariant.create({
            data: { variantId: product.variants[i].id, cjVid: cj.vid, cjVariantSku: cj.variantSku || product.variants[i].sku },
          });
        }
      }

      // Publish to the house store so it appears in the shop immediately.
      const slug = await uniqueStoreSlug(tx, house.id, slugify(title));
      const storeProduct = await tx.storeProduct.create({
        data: {
          storeId: house.id,
          productId: product.id,
          title,
          slug,
          description,
          price: retail,
        },
      });
      return { productId: product.id, storeProductId: storeProduct.id };
    });

    await logCj("import", "INFO", `Imported "${title}" (${pid})`, { refId: result.productId });
    return { ok: true, ...result };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Import failed";
    await logCj("import", "ERROR", `Import failed for ${pid}: ${error}`, { refId: pid });
    return { ok: false, error };
  }
}

/** A store-unique slug (StoreProduct has @@unique([storeId, slug])). */
async function uniqueStoreSlug(tx: Prisma.TransactionClient, storeId: string, base: string): Promise<string> {
  const root = base || "product";
  let slug = root;
  for (let i = 2; i < 50; i++) {
    const clash = await tx.storeProduct.findFirst({ where: { storeId, slug } });
    if (!clash) return slug;
    slug = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}
