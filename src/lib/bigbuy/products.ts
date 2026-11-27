import "server-only";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { BbMerged } from "./catalog";
import { logBigBuy } from "./log";
import { HOUSE_STORE_SLUG } from "@/lib/catalog";
import { db } from "@/lib/db";
import { retailFromCost } from "@/lib/pricing";
import { slugify } from "@/lib/utils";

// Import a cached BigBuy catalogue item into the Olozzo catalogue and publish it to the house
// store — the mirror of src/lib/cj/products.ts, minus the FX layer (BigBuy prices are EUR).

// Reserved identity for the BigBuy "virtual supplier". All BigBuy-sourced products hang off it,
// so the existing supplier/fulfilment pipeline works unchanged.
export const BIGBUY_SUPPLIER_EMAIL = "bigbuy@olozzo.internal";
const BIGBUY_SUPPLIER_COMPANY = "BigBuy";

/** The BigBuy virtual supplier, created on first import. Idempotent. */
export async function ensureBigBuySupplier() {
  const existing = await db.supplier.findFirst({ where: { user: { email: BIGBUY_SUPPLIER_EMAIL } } });
  if (existing) return existing;
  const user = await db.user.upsert({
    where: { email: BIGBUY_SUPPLIER_EMAIL },
    update: {},
    create: {
      email: BIGBUY_SUPPLIER_EMAIL,
      name: BIGBUY_SUPPLIER_COMPANY,
      // Random hash: this account is API-only and cannot be logged into.
      passwordHash: await bcrypt.hash(`bigbuy-${Date.now()}-${Math.random()}`, 10),
      role: "SUPPLIER",
      status: "ACTIVE",
    },
  });
  return db.supplier.create({
    data: {
      userId: user.id,
      companyName: BIGBUY_SUPPLIER_COMPANY,
      country: "ES", // BigBuy ships from Spain
      description: "Automated BigBuy supplier. Products are imported and fulfilled via the BigBuy API.",
      status: "APPROVED",
    },
  });
}

export type ImportResult = { ok: true; productId: string; storeProductId: string } | { ok: false; error: string };

/**
 * Import one cached BigBuy product (by its SKU) into the catalogue and publish it to the house store.
 * Dedupes on BigBuyProduct.bbSku, so importing the same product twice is a no-op.
 */
export async function importBigBuyProduct(bbSku: string, opts: { markupPercent?: number } = {}): Promise<ImportResult> {
  const already = await db.bigBuyProduct.findUnique({ where: { bbSku } });
  if (already) return { ok: false, error: "This product has already been imported." };

  const item = await db.bigBuyCatalogItem.findUnique({ where: { bbSku } });
  if (!item) return { ok: false, error: "Product is not in the cached BigBuy catalogue. Run a catalogue sync first." };

  const supplier = await ensureBigBuySupplier();
  const house = await db.store.findUnique({ where: { slug: HOUSE_STORE_SLUG } });
  if (!house) return { ok: false, error: `House store "${HOUSE_STORE_SLUG}" not found. Seed the shop first.` };

  const merged = (item.raw ?? null) as BbMerged | null;
  const title = item.name || item.bbSku;
  const description = item.description || title;
  const images: string[] = merged?.images?.length ? merged.images : item.image ? [item.image] : [];
  const baseCost = item.costCents;
  const markup = opts.markupPercent ?? house.markupPercent;
  const retail = retailFromCost(baseCost, markup, house.priceEnding99);

  // Variations come from the cached snapshot. Their display names are the BigBuy SKUs for now:
  // resolving human attribute names needs the variations/attributes/attributesgroups joins — a
  // follow-up once those endpoints are confirmed. Single-variant products get one "Default" row.
  const mergedVariations = merged?.variations ?? [];
  const variantData =
    mergedVariations.length > 0
      ? mergedVariations.map((v, i) => ({
          name: v.sku || `Variant ${i + 1}`,
          sku: v.sku || `${item.bbSku}-${i + 1}`,
          costPrice: v.costCents || baseCost,
          stock: Math.max(0, v.stock),
          position: i,
        }))
      : [{ name: "Default", sku: item.bbSku, costPrice: baseCost, stock: Math.max(0, item.stock), position: 0 }];

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          supplierId: supplier.id,
          title,
          description,
          images: JSON.stringify(images),
          sku: item.bbSku,
          costPrice: baseCost,
          suggestedPrice: retail,
          shippingCost: 0, // markup absorbs BigBuy freight (consistent with the CJ supplier)
          weightGrams: item.weightGrams,
          active: item.active,
          variants: { create: variantData },
        },
        include: { variants: true },
      });

      await tx.bigBuyProduct.create({
        data: {
          productId: product.id,
          bbId: item.bbId,
          bbSku: item.bbSku,
          parentTaxonomy: item.parentTaxonomy,
          lastSyncedAt: new Date(),
          raw: item.raw ?? undefined,
        },
      });

      // Map each created variant to its BigBuy variation (same order as variantData).
      for (let i = 0; i < product.variants.length; i++) {
        const bb = mergedVariations[i];
        await tx.bigBuyVariant.create({
          data: {
            variantId: product.variants[i].id,
            bbVariation: bb?.bbVariation ?? null,
            bbSku: bb?.sku || product.variants[i].sku,
          },
        });
      }

      const slug = await uniqueStoreSlug(tx, house.id, slugify(title));
      const storeProduct = await tx.storeProduct.create({
        data: { storeId: house.id, productId: product.id, title, slug, description, price: retail },
      });
      return { productId: product.id, storeProductId: storeProduct.id };
    });

    await logBigBuy("import", "INFO", `Imported "${title}" (${item.bbSku})`, { refId: result.productId });
    return { ok: true, ...result };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Import failed";
    await logBigBuy("import", "ERROR", `Import failed for ${item.bbSku}: ${error}`, { refId: item.bbSku });
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
