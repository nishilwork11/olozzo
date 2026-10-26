import "server-only";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { db } from "@/lib/db";
import { parseImages } from "@/lib/utils";
import trendingList from "../../prisma/catalog/trending.json";

// Shop catalog queries (Temu/DHgate-style shop): category tree, product listings with search,
// filters, sorting and pagination, and the homepage rails. Server-only.

/** olozzo's own store. Every shop product is listed here, so shoppers check out with one cart. */
export const HOUSE_STORE_SLUG = "olozzo";

export type CategoryNode = {
  id: string;
  slug: string;
  name: string;
  /** lucide-react icon name (top-level categories) */
  icon: string | null;
  /** Picture for menus and tiles: the first product image in this category or its subcategories */
  image: string | null;
  /** Shop products in this category, including its subcategories */
  productCount: number;
  children: CategoryNode[];
};

export type ShopListing = {
  id: string;
  title: string;
  href: string;
  storeSlug: string;
  price: number; // cents incl. VAT (base variant)
  compareAtPrice: number | null;
  /** Whole-number percentage saved against compareAtPrice; 0 when not on sale */
  discountPercent: number;
  image: string | null;
  images: string[];
  category: { slug: string; name: string } | null;
  shipsFrom: string; // ISO country of the supplier's warehouse
  shippingDaysMin: number;
  shippingDaysMax: number;
  hasVariants: boolean;
  soldOut: boolean;
  featured: boolean;
  createdAt: Date;
};

export type ShopSort = "recommended" | "newest" | "price-asc" | "price-desc" | "discount";

export const SHOP_SORTS: { value: ShopSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
];

export type ShopQuery = {
  /** category slug (top-level includes its subcategories) */
  category?: string;
  q?: string;
  sort?: ShopSort;
  page?: number; // 1-based
  pageSize?: number;
  minPrice?: number; // cents
  maxPrice?: number; // cents
  dealsOnly?: boolean;
};

export type ShopPage = { items: ShopListing[]; total: number; page: number; pageSize: number; pageCount: number };

const shopProductWhere: Prisma.ProductWhereInput = { active: true, supplier: { status: "APPROVED" } };

const listingInclude = {
  store: { select: { slug: true } },
  product: {
    select: {
      images: true,
      shippingDaysMin: true,
      shippingDaysMax: true,
      category: { select: { slug: true, name: true } },
      supplier: { select: { country: true } },
      variants: { where: { position: { lt: 999 } }, select: { stock: true } },
    },
  },
} satisfies Prisma.StoreProductInclude;

type ListingRow = Prisma.StoreProductGetPayload<{ include: typeof listingInclude }>;

function discountOf(price: number, compareAtPrice: number | null): number {
  return compareAtPrice && compareAtPrice > price ? Math.round((1 - price / compareAtPrice) * 100) : 0;
}

function toListing(sp: ListingRow): ShopListing {
  const images = parseImages(sp.product.images);
  const variants = sp.product.variants;
  return {
    id: sp.id,
    title: sp.title,
    href: `/s/${sp.store.slug}/products/${sp.slug}`,
    storeSlug: sp.store.slug,
    price: sp.price,
    compareAtPrice: sp.compareAtPrice,
    discountPercent: discountOf(sp.price, sp.compareAtPrice),
    image: images[0] ?? null,
    images,
    category: sp.product.category,
    shipsFrom: sp.product.supplier.country,
    shippingDaysMin: sp.product.shippingDaysMin,
    shippingDaysMax: sp.product.shippingDaysMax,
    hasVariants: variants.length > 1,
    soldOut: variants.length > 0 && variants.every((v) => v.stock <= 0),
    featured: sp.featured,
    createdAt: sp.createdAt,
  };
}

/** The house store, when it exists and is published (otherwise listings come from all published stores). */
const getHouseStore = cache(async () => {
  const store = await db.store.findUnique({ where: { slug: HOUSE_STORE_SLUG }, select: { id: true, published: true } });
  return store?.published ? store : null;
});

async function listingScope(): Promise<Prisma.StoreProductWhereInput> {
  const house = await getHouseStore();
  return { active: true, store: house ? { id: house.id } : { published: true } };
}

// ── Category tree ───────────────────────────────────────────

const loadCategoryTree = unstable_cache(
  async (): Promise<CategoryNode[]> => {
    const scope = await listingScope();
    const inShop: Prisma.ProductWhereInput = { ...shopProductWhere, storeProducts: { some: scope } };
    const [categories, counts, firstImages] = await Promise.all([
      db.category.findMany({
        select: { id: true, slug: true, name: true, icon: true, parentId: true },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
      db.product.groupBy({ by: ["categoryId"], where: inShop, _count: { _all: true } }),
      db.product.findMany({
        where: inShop,
        select: { categoryId: true, images: true },
        distinct: ["categoryId"],
        orderBy: [{ createdAt: "asc" }],
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const imageBy = new Map(firstImages.map((p) => [p.categoryId, parseImages(p.images)[0] ?? null]));
    const node = (c: (typeof categories)[number]): CategoryNode => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      image: imageBy.get(c.id) ?? null,
      productCount: countBy.get(c.id) ?? 0,
      children: [],
    });
    const byId = new Map(categories.map((c) => [c.id, node(c)]));
    const roots: CategoryNode[] = [];
    for (const c of categories) {
      const n = byId.get(c.id)!;
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    for (const root of roots) {
      root.productCount += root.children.reduce((sum, ch) => sum + ch.productCount, 0);
      root.image ??= root.children.find((ch) => ch.image)?.image ?? null;
    }
    return roots;
  },
  ["olozzo-category-tree-v1"],
  { revalidate: 300, tags: ["catalog"] },
);

/** Top-level categories (in menu order) with their subcategories. Cached for 5 minutes. */
export const getCategoryTree = cache(() => loadCategoryTree());

/** A category by slug with its parent (null for top-level) — from the cached tree. */
export async function getCategory(slug: string): Promise<{ category: CategoryNode; parent: CategoryNode | null } | null> {
  for (const root of await getCategoryTree()) {
    if (root.slug === slug) return { category: root, parent: null };
    const child = root.children.find((c) => c.slug === slug);
    if (child) return { category: child, parent: root };
  }
  return null;
}

/**
 * Shorter label for a subcategory shown under its parent: drops the words it shares with the parent,
 * e.g. "Women's Dresses" under "Women's Clothing" → "Dresses".
 */
export function subcategoryLabel(name: string, parentName: string): string {
  const words = name.split(" ");
  const parentWords = parentName.split(" ");
  let i = 0;
  while (i < words.length - 1 && i < parentWords.length && words[i] === parentWords[i]) i++;
  return words.slice(i).join(" ");
}

async function categoryIds(slug: string): Promise<string[]> {
  const found = await getCategory(slug);
  if (!found) return [];
  return [found.category.id, ...found.category.children.map((c) => c.id)];
}

// ── Listings ────────────────────────────────────────────────

// Stable pseudo-random order (FNV-1a), so "recommended" mixes categories and rails can rotate daily
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** When the daily deals selection changes (next midnight UTC) — the only thing the deals countdown counts down to. */
export function nextDealsRefresh(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

async function buildWhere(query: ShopQuery): Promise<Prisma.StoreProductWhereInput | null> {
  const product: Prisma.ProductWhereInput = { ...shopProductWhere };
  if (query.category) {
    const ids = await categoryIds(query.category);
    if (ids.length === 0) return null;
    product.categoryId = { in: ids };
  }
  const where: Prisma.StoreProductWhereInput = { ...(await listingScope()), product };
  const term = query.q?.trim().slice(0, 100);
  if (term) {
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { product: { category: { name: { contains: term, mode: "insensitive" } } } },
    ];
  }
  if (query.minPrice != null || query.maxPrice != null) {
    where.price = { ...(query.minPrice != null && { gte: query.minPrice }), ...(query.maxPrice != null && { lte: query.maxPrice }) };
  }
  if (query.dealsOnly) where.compareAtPrice = { gt: db.storeProduct.fields.price };
  return where;
}

type LightRow = { id: string; productId: string; price: number; compareAtPrice: number | null; featured: boolean; createdAt: Date };

function sortRows(rows: LightRow[], sort: ShopSort, salt = ""): LightRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "discount":
      return sorted.sort((a, b) => discountOf(b.price, b.compareAtPrice) - discountOf(a.price, a.compareAtPrice) || a.price - b.price);
    default:
      return sorted.sort((a, b) => Number(b.featured) - Number(a.featured) || hash(a.id + salt) - hash(b.id + salt));
  }
}

async function fetchListings(ids: string[]): Promise<ShopListing[]> {
  if (ids.length === 0) return [];
  const rows = await db.storeProduct.findMany({ where: { id: { in: ids } }, include: listingInclude });
  const byId = new Map(rows.map((r) => [r.id, toListing(r)]));
  return ids.map((id) => byId.get(id)).filter((l): l is ShopListing => !!l);
}

// The catalog is a few thousand listings at most, so matching rows are sorted in memory (any sort,
// including discount and the mixed "recommended" feed) and only the requested page is loaded in full.
async function matchingRows(where: Prisma.StoreProductWhereInput): Promise<LightRow[]> {
  const rows = await db.storeProduct.findMany({
    where,
    select: { id: true, productId: true, price: true, compareAtPrice: true, featured: true, createdAt: true },
  });
  // Without a house store, several stores may list the same product: keep one listing per product
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.productId) ? false : (seen.add(r.productId), true)));
}

/**
 * Search relevance for the default sort: listings with the term in their title first, then those in a category
 * named after it, then the ones that only mention it in the description. The order within each group is kept.
 */
async function rankBySearch(rows: LightRow[], where: Prisma.StoreProductWhereInput, term: string): Promise<LightRow[]> {
  const contains = { contains: term, mode: "insensitive" as const };
  const [inTitle, inCategory] = await Promise.all([
    db.storeProduct.findMany({ where: { AND: [where, { title: contains }] }, select: { id: true } }),
    db.storeProduct.findMany({ where: { AND: [where, { product: { category: { name: contains } } }] }, select: { id: true } }),
  ]);
  const titleIds = new Set(inTitle.map((r) => r.id));
  const categoryIds = new Set(inCategory.map((r) => r.id));
  const score = (r: LightRow) => (titleIds.has(r.id) ? 2 : categoryIds.has(r.id) ? 1 : 0);
  return [...rows].sort((a, b) => score(b) - score(a));
}

/** Search/browse the shop: filters, sorting and pagination. */
export async function getShopListings(query: ShopQuery = {}): Promise<ShopPage> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 40, 1), 100);
  const where = await buildWhere(query);
  if (!where) return { items: [], total: 0, page: 1, pageSize, pageCount: 0 };
  const sort = query.sort ?? "recommended";
  const term = query.q?.trim().slice(0, 100);
  let rows = sortRows(await matchingRows(where), sort);
  // A sort the shopper picked (price, newest, discount) wins over relevance
  if (term && sort === "recommended") rows = await rankBySearch(rows, where, term);
  const pageCount = Math.ceil(rows.length / pageSize);
  const page = Math.min(Math.max(query.page ?? 1, 1), Math.max(pageCount, 1));
  const ids = rows.slice((page - 1) * pageSize, page * pageSize).map((r) => r.id);
  return { items: await fetchListings(ids), total: rows.length, page, pageSize, pageCount };
}

/** Today's deals: listings with a real discount, in an order that changes once a day. */
export async function getDeals(limit: number): Promise<ShopListing[]> {
  const where = await buildWhere({ dealsOnly: true });
  if (!where) return [];
  const rows = sortRows(await matchingRows(where), "recommended", utcDayKey());
  return fetchListings(rows.slice(0, limit).map((r) => r.id));
}

export async function getNewArrivals(limit: number): Promise<ShopListing[]> {
  return (await getShopListings({ sort: "newest", pageSize: limit })).items;
}

/** Best sellers by units in paid orders; topped up with recommended products while sales are thin. */
export async function getPopular(limit: number): Promise<ShopListing[]> {
  const where = await buildWhere({});
  if (!where) return [];
  const [rows, sales] = await Promise.all([
    matchingRows(where),
    db.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, order: { paymentStatus: "PAID" } },
      _sum: { quantity: true },
    }),
  ]);
  const sold = new Map(sales.map((s) => [s.productId, s._sum.quantity ?? 0]));
  const ranked = sortRows(rows, "recommended").sort((a, b) => (sold.get(b.productId) ?? 0) - (sold.get(a.productId) ?? 0));
  return fetchListings(ranked.slice(0, limit).map((r) => r.id));
}

/**
 * "Trending now": the products in prisma/catalog/trending.json, which ranks what shoppers search for most this
 * month (market research, not our own sales). In rank order; SKUs the shop doesn't list yet are skipped.
 */
export async function getTrending(limit = trendingList.products.length): Promise<ShopListing[]> {
  const skus = trendingList.products.map((t) => t.sku);
  const rows = await db.storeProduct.findMany({
    where: { ...(await listingScope()), product: { ...shopProductWhere, sku: { in: skus } } },
    select: { id: true, product: { select: { sku: true } } },
  });
  const listingBySku = new Map<string, string>();
  for (const r of rows) if (!listingBySku.has(r.product.sku)) listingBySku.set(r.product.sku, r.id);
  return fetchListings(skus.flatMap((sku) => listingBySku.get(sku) ?? []).slice(0, limit));
}

/** Products from the same category, for "You may also like". */
export async function getRelated(categorySlug: string | null | undefined, excludeListingId: string, limit: number): Promise<ShopListing[]> {
  if (!categorySlug) return [];
  const { items } = await getShopListings({ category: categorySlug, pageSize: limit + 1 });
  return items.filter((l) => l.id !== excludeListingId).slice(0, limit);
}
