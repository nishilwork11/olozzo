/*
 * Shop catalog seed: additive and idempotent, safe to re-run against the live database.
 *   npm run db:seed-catalog                         write
 *   npm run db:seed-catalog -- --dry-run            read + validate, report what would change, write nothing
 *   npm run db:seed-catalog -- --per-category=N     import at most N products per category file (default 20)
 *
 * Unlike prisma/seed.ts (which wipes the database) this never deletes orders, users, stores or other stores'
 * listings. It brings the database in line with prisma/catalog/:
 *   1. the "olozzo" house store and its merchant login (every shop product is listed there)
 *   2. categories.json: the two-level category tree, upserted by slug; the legacy flat "fashion" category is
 *      removed once it is empty
 *   3. the demo products from prisma/seed.ts move into the matching subcategories
 *   4. suppliers.json: one APPROVED supplier, with its own login, per entry
 *   5. products/*.json (checked with validate.cjs first): products upserted by SKU, with their variants
 *   6. a house-store listing for every active product of an approved supplier
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { slugify } from "../src/lib/utils";

const CATALOG_DIR = path.join(__dirname, "catalog");
const PRODUCTS_DIR = path.join(CATALOG_DIR, "products");
const HOUSE_STORE_SLUG = "olozzo"; // = HOUSE_STORE_SLUG in src/lib/catalog.ts (server-only, so not imported here)
const HOUSE_EMAIL = "shop@olozzo.com";
const HOUSE_USER_NAME = "olozzo Shop";
const DEFAULT_PER_CATEGORY = 20;
const CONCURRENCY = 8; // the database is far away (~250 ms per round trip): keep a few requests in flight
const HIDDEN_POSITION = 999; // variants kept only for order history (same rule as src/app/supplier/actions.ts)

// ── Options ─────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
let perCategory = DEFAULT_PER_CATEGORY;
for (const arg of process.argv.slice(2)) {
  const limit = /^--per-category=(\d+)$/.exec(arg);
  if (limit && Number(limit[1]) > 0) perCategory = Number(limit[1]);
  else if (arg !== "--dry-run") {
    // a mistyped --dry-run must never turn into a real run
    console.error(`Unknown option "${arg}". Options: --dry-run, --per-category=N`);
    process.exit(1);
  }
}

// ── Catalog files ───────────────────────────────────────────

type CategoryJson = { slug: string; name: string; icon?: string | null; children?: { slug: string; name: string; icon?: string | null }[] };
type SupplierJson = { key: string; companyName: string; contactName: string; country: string; processingDays: number; description: string };
type ProductJson = {
  sku: string;
  title: string;
  category: string; // the top-level slug of its file, or one of its subcategories
  supplier: string; // a key from suppliers.json
  description: string;
  images: string[];
  price: number; // retail incl. VAT, cents
  compareAtPrice: number | null;
  costPrice: number;
  variants: { name: string; stock: number }[];
  shippingDaysMin: number;
  shippingDaysMax: number;
  weightGrams: number;
  featured: boolean;
};
type ProductFile = { slug: string; name: string; products: ProductJson[]; notImported: number };

// Demo products from prisma/seed.ts and the subcategory each one moves to (titles match case-insensitively)
const LEGACY_PRODUCTS: [title: string, categorySlug: string][] = [
  ["Aurora ANC Wireless Headphones", "headphones"],
  ["PulseBuds Pro True Wireless Earbuds", "headphones"],
  ["Boom Mini Waterproof Speaker", "speakers"],
  ["Vita Smartwatch Fitness Tracker", "wearables"],
  ["Snap Retro Instant Camera", "cameras"],
  ["Lumen Rose Gold Minimalist Watch", "womens-watches"],
  ["Classic White Dial Watch", "mens-watches"],
  ["Riviera Polarised Sunglasses", "sunglasses"],
  ["Organic Cotton Tote Bag", "tote-bags"],
  ["Essential Crewneck Sweatshirt", "mens-hoodies"],
  ["Metro Commuter Backpack", "backpacks"],
  ["Prism Chunky Retro Sneakers", "womens-sneakers"],
  ["Velocity Red Runners", "mens-running-shoes"],
  ["Velvet Mid-Century 2-Seater Sofa", "furniture"],
  ["Hydra Daily Moisturiser 50 ml", "skincare"],
  ["Glow Skincare Starter Kit", "skincare"],
  ["Noir Eau de Parfum 50 ml", "fragrances"],
  ["Flow Eco Yoga Mat", "yoga"],
  ["Thermo Steel Bottle 500 ml", "camping-hiking"],
];
const LEGACY_FASHION_SLUG = "fashion";

// ── Helpers ─────────────────────────────────────────────────

const db = new PrismaClient();

class SeedError extends Error {}
function fail(message: string): never {
  throw new SeedError(message);
}

// Stand-in id for a row a dry run would create
const NEW_ID = "(new)";
const placeholder = (what: string) => `${NEW_ID} ${what}`;
const isPlaceholder = (id: string) => id.startsWith(NEW_ID);

const randomPassword = () => randomBytes(18).toString("base64url");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const rel = (file: string) => path.relative(process.cwd(), file) || file;
/** "created" → "would be created" in a dry run */
const did = (verb: string) => (DRY_RUN ? `would be ${verb}` : verb);

// Password of a house-store login this run created: printed exactly once, at the end (or on failure)
let newHousePassword: string | null = null;

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (e) {
    return fail(`Could not read ${rel(file)}: ${(e as Error).message}`);
  }
}

/** Runs fn over items with at most `limit` calls in flight; results keep the input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function changed<T extends object>(current: T, wanted: Partial<T>): boolean {
  return (Object.keys(wanted) as (keyof T)[]).some((k) => current[k] !== wanted[k]);
}

// ── 0. Validate and read the catalog ────────────────────────

/** Runs prisma/catalog/validate.cjs (the single source of the catalog rules) and stops on any error. */
function validateCatalog() {
  process.stdout.write("Validating prisma/catalog … ");
  const run = spawnSync(process.execPath, [path.join(CATALOG_DIR, "validate.cjs")], { encoding: "utf8" });
  const lines = `${run.stdout ?? ""}${run.stderr ?? ""}`.split(/\r?\n/).filter(Boolean);
  if (run.status !== 0) {
    console.log("FAILED\n");
    for (const line of lines) console.log(`  ${line}`);
    if (run.error) console.log(`  ${run.error.message}`);
    fail("The catalog data has errors (listed above). Fix them, re-check with `node prisma/catalog/validate.cjs` and run again. Nothing was written.");
  }
  const warnings = lines.filter((l) => l.startsWith("WARN"));
  console.log(lines[0] ?? "OK");
  for (const w of warnings.slice(0, 8)) console.log(`  ${w}`);
  if (warnings.length > 8) console.log(`  … and ${warnings.length - 8} more warnings (node prisma/catalog/validate.cjs lists them all)`);
}

/** SKUs listed in trending.json. They are imported even past the per-category limit: the homepage features them. */
function readTrendingSkus(): Set<string> {
  const file = path.join(CATALOG_DIR, "trending.json");
  if (!existsSync(file)) return new Set();
  return new Set(readJson<{ products: { sku: string }[] }>(file).products.map((t) => t.sku));
}

function readProductFiles(tree: CategoryJson[]): ProductFile[] {
  if (!existsSync(PRODUCTS_DIR)) return [];
  const trending = readTrendingSkus();
  const order = new Map(tree.map((t, i) => [t.slug, i]));
  return readdirSync(PRODUCTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"))
    .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b))
    .map((slug) => {
      const all = readJson<ProductJson[]>(path.join(PRODUCTS_DIR, `${slug}.json`));
      const products = all.filter((p, i) => i < perCategory || trending.has(p.sku));
      return { slug, name: tree.find((t) => t.slug === slug)?.name ?? slug, products, notImported: all.length - products.length };
    });
}

// ── 1. House store ──────────────────────────────────────────

/** Read-only: finds the house store and its login, and stops (before anything is written) if the store can't be made. */
async function checkHouseStore() {
  const [store, user] = await Promise.all([
    db.store.findUnique({ where: { slug: HOUSE_STORE_SLUG }, select: { id: true, published: true, owner: { select: { email: true } } } }),
    db.user.findUnique({ where: { email: HOUSE_EMAIL }, select: { id: true, name: true, role: true, store: { select: { slug: true } } } }),
  ]);
  if (!store && user?.store) {
    fail(
      `${HOUSE_EMAIL} already owns the store "${user.store.slug}" (one store per account), so the house store "${HOUSE_STORE_SLUG}" ` +
        `can't be created for it. Change that store's slug to "${HOUSE_STORE_SLUG}" or give it another owner, then run again. Nothing was written.`,
    );
  }
  return { store, user };
}

async function ensureHouseStore({ store, user }: Awaited<ReturnType<typeof checkHouseStore>>) {
  const storeData = {
    name: "olozzo",
    slug: HOUSE_STORE_SLUG,
    tagline: "Everyday products, shipped from EU warehouses",
    published: true,
    plan: "PRO",
    country: "DE",
  };
  const notes: string[] = [];

  // The login
  if (!user) {
    notes.push(`login ${HOUSE_EMAIL} ${did("created")}`);
  } else if (user.role !== "MERCHANT" || user.name !== HOUSE_USER_NAME) {
    // keep its password, just make sure it is the shop's merchant login
    notes.push(`login ${HOUSE_EMAIL} ${did("updated")} (merchant role, name "${HOUSE_USER_NAME}")`);
    if (!DRY_RUN) await db.user.update({ where: { id: user.id }, data: { role: "MERCHANT", name: HOUSE_USER_NAME } });
  }

  // The store
  if (store) {
    notes.unshift(`store "${HOUSE_STORE_SLUG}" exists (owner ${store.owner.email})`);
    if (!store.published) notes.push("WARNING: it is not published, so the shop lists every published store's products instead");
  } else {
    notes.unshift(`store "${HOUSE_STORE_SLUG}" ${did("created")}`);
  }
  if (DRY_RUN) return { id: store?.id ?? placeholder("house store"), notes };

  if (!user) {
    // login and store together, so a failed run never leaves a login whose password nobody saw
    const password = randomPassword();
    const created = await db.user.create({
      data: {
        email: HOUSE_EMAIL,
        name: HOUSE_USER_NAME,
        role: "MERCHANT",
        passwordHash: await bcrypt.hash(password, 10),
        ...(store ? {} : { store: { create: storeData } }),
      },
      select: { store: { select: { id: true } } },
    });
    newHousePassword = password;
    return { id: store?.id ?? created.store!.id, notes };
  }
  if (store) return { id: store.id, notes };
  const created = await db.store.create({ data: { ...storeData, ownerId: user.id }, select: { id: true } });
  return { id: created.id, notes };
}

// ── 2. Categories ───────────────────────────────────────────

async function syncCategories(tree: CategoryJson[]) {
  const existing = await db.category.findMany({ select: { id: true, slug: true, name: true, icon: true, position: true, parentId: true } });
  const bySlug = new Map(existing.map((c) => [c.slug, c]));
  const byName = new Map(existing.map((c) => [c.name, c]));
  const ids = new Map(existing.map((c) => [c.slug, c.id]));

  // Each top-level category followed by its subcategories; position = index among its siblings
  const wanted = tree.flatMap((top, i) => [
    { slug: top.slug, name: top.name, icon: top.icon ?? null, position: i, parentSlug: null as string | null },
    ...(top.children ?? []).map((child, j) => ({ slug: child.slug, name: child.name, icon: child.icon ?? null, position: j, parentSlug: top.slug as string | null })),
  ]);

  // Names are unique: a different category holding a wanted name is renamed "<name> (old <slug>)" first
  const renames: { id: string; name: string }[] = [];
  for (const w of wanted) {
    const holder = byName.get(w.name);
    if (!holder || holder.slug === w.slug) continue;
    let name = `${w.name} (old ${holder.slug})`;
    for (let n = 2; byName.has(name); n++) name = `${w.name} (old ${holder.slug}) ${n}`;
    renames.push({ id: holder.id, name });
    byName.delete(holder.name);
    holder.name = name;
    byName.set(name, holder);
  }
  if (!DRY_RUN) for (const r of renames) await db.category.update({ where: { id: r.id }, data: { name: r.name } });

  // Missing categories: top level first, then subcategories (they need their parent's id)
  let created = 0;
  for (const topLevel of [true, false]) {
    const missing = wanted.filter((w) => !w.parentSlug === topLevel && !bySlug.has(w.slug));
    if (!missing.length) continue;
    created += missing.length;
    if (DRY_RUN) {
      for (const w of missing) ids.set(w.slug, placeholder(w.slug));
      continue;
    }
    const rows = await db.category.createManyAndReturn({
      data: missing.map((w) => ({ slug: w.slug, name: w.name, icon: w.icon, position: w.position, parentId: w.parentSlug ? ids.get(w.parentSlug)! : null })),
      select: { id: true, slug: true },
    });
    for (const r of rows) ids.set(r.slug, r.id);
  }

  // Existing categories whose name, icon, position or parent differ
  const updates = wanted.flatMap((w) => {
    const current = bySlug.get(w.slug);
    if (!current) return [];
    const data = { name: w.name, icon: w.icon, position: w.position, parentId: w.parentSlug ? ids.get(w.parentSlug)! : null };
    return changed(current, data) ? [{ id: current.id, data }] : [];
  });
  if (!DRY_RUN) await mapLimit(updates, CONCURRENCY, (u) => db.category.update({ where: { id: u.id }, data: u.data }));

  return { ids, bySlug, wantedSlugs: new Set(wanted.map((w) => w.slug)), total: wanted.length, created, updated: updates.length, renamed: renames.length };
}

// ── 3. Legacy demo products and the old "fashion" category ──

async function moveLegacyProducts(categoryIds: Map<string, string>, catalogSkus: Set<string>) {
  const slugByTitle = new Map(LEGACY_PRODUCTS.map(([title, slug]) => [title.toLowerCase(), slug]));
  const found = (
    await db.product.findMany({
      where: { OR: LEGACY_PRODUCTS.map(([title]) => ({ title: { equals: title, mode: "insensitive" as const } })) },
      select: { id: true, title: true, sku: true, categoryId: true },
    })
  ).filter((p) => slugByTitle.has(p.title.toLowerCase()) && !catalogSkus.has(p.sku));

  const moves = new Map<string, string[]>(); // category id → product ids
  const warnings: string[] = [];
  for (const p of found) {
    const slug = slugByTitle.get(p.title.toLowerCase())!;
    const categoryId = categoryIds.get(slug);
    if (!categoryId) warnings.push(`"${p.title}": category "${slug}" is not in categories.json, left where it is`);
    else if (p.categoryId !== categoryId) moves.set(categoryId, [...(moves.get(categoryId) ?? []), p.id]);
  }
  if (!DRY_RUN) {
    await mapLimit([...moves], CONCURRENCY, ([categoryId, ids]) => db.product.updateMany({ where: { id: { in: ids } }, data: { categoryId } }));
  }
  const foundTitles = new Set(found.map((p) => p.title.toLowerCase()));
  return {
    ids: new Set(found.map((p) => p.id)),
    movedIds: [...moves.values()].flat(),
    missing: LEGACY_PRODUCTS.map(([title]) => title).filter((t) => !foundTitles.has(t.toLowerCase())),
    warnings,
  };
}

/** Deletes the legacy flat "fashion" category once the moves above have emptied it. */
async function removeLegacyFashion(categories: Awaited<ReturnType<typeof syncCategories>>, movedIds: string[]): Promise<string> {
  const fashion = categories.bySlug.get(LEGACY_FASHION_SLUG);
  if (!fashion) return "not present";
  if (categories.wantedSlugs.has(LEGACY_FASHION_SLUG)) return "kept (it is in categories.json)";
  const [products, children] = await Promise.all([
    db.product.count({ where: { categoryId: fashion.id, id: { notIn: movedIds } } }),
    db.category.count({ where: { parentId: fashion.id, slug: { notIn: [...categories.wantedSlugs] } } }),
  ]);
  if (products || children) {
    return `kept: it still has ${[products && plural(products, "product"), children && plural(children, "subcategory")].filter(Boolean).join(" and ")}`;
  }
  if (DRY_RUN) return `${did("deleted")} (empty after the moves)`;
  const { count } = await db.category.deleteMany({ where: { id: fashion.id, products: { none: {} }, children: { none: {} } } });
  return count ? "deleted (empty after the moves)" : "kept (something was added to it meanwhile)";
}

// ── 4. Suppliers ────────────────────────────────────────────

async function syncSuppliers(rows: SupplierJson[]) {
  const emailOf = (key: string) => `supplier+${key}@olozzo.com`;
  const users = await db.user.findMany({
    where: { email: { in: rows.map((r) => emailOf(r.key)) } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      supplier: { select: { id: true, companyName: true, country: true, description: true, processingDays: true, status: true } },
    },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const ids = new Map<string, string>(); // supplier key → supplier id
  const stats = { created: 0, updated: 0, unchanged: 0 };

  await mapLimit(rows, CONCURRENCY, async (row) => {
    const email = emailOf(row.key);
    const profile = { companyName: row.companyName, country: row.country, description: row.description, processingDays: row.processingDays, status: "APPROVED" };
    const user = byEmail.get(email);
    if (!user) {
      stats.created++;
      if (DRY_RUN) return void ids.set(row.key, placeholder(row.key));
      // The password is random and never shown: these logins only own the supplier records
      const created = await db.user.create({
        data: { email, name: row.contactName, role: "SUPPLIER", passwordHash: await bcrypt.hash(randomPassword(), 10), supplier: { create: profile } },
        select: { supplier: { select: { id: true } } },
      });
      return void ids.set(row.key, created.supplier!.id);
    }
    const userChanged = user.name !== row.contactName || user.role !== "SUPPLIER";
    if (user.supplier && !userChanged && !changed(user.supplier, profile)) {
      stats.unchanged++;
      return void ids.set(row.key, user.supplier.id);
    }
    if (user.supplier) stats.updated++;
    else stats.created++;
    if (DRY_RUN) return void ids.set(row.key, user.supplier?.id ?? placeholder(row.key));
    if (userChanged) await db.user.update({ where: { id: user.id }, data: { name: row.contactName, role: "SUPPLIER" } });
    const supplier = await db.supplier.upsert({ where: { userId: user.id }, create: { ...profile, userId: user.id }, update: profile, select: { id: true } });
    ids.set(row.key, supplier.id);
  });
  return { ids, ...stats };
}

// ── 5. Products and variants ────────────────────────────────

type VariantRow = { name: string; sku: string; costPrice: number; stock: number; position: number };
type ExistingVariant = VariantRow & { id: string; _count: { orderItems: number } };
type VariantOp =
  | { kind: "replace"; rows: VariantRow[] }
  | { kind: "create"; row: VariantRow }
  | { kind: "update"; id: string; row: VariantRow }
  | { kind: "hide"; id: string }
  | { kind: "delete"; id: string };

const sameVariant = (a: VariantRow, b: VariantRow) =>
  a.name === b.name && a.sku === b.sku && a.costPrice === b.costPrice && a.stock === b.stock && a.position === b.position;

/** The variant writes that bring a product in line with its file entry (none when it already matches). */
function planVariants(existing: ExistingVariant[], wanted: VariantRow[]): VariantOp[] {
  if (existing.every((v) => v._count.orderItems === 0)) {
    // never ordered: replace the whole list, unless it is identical already
    const current = [...existing].sort((a, b) => a.position - b.position);
    const identical = current.length === wanted.length && current.every((v, i) => sameVariant(v, wanted[i]));
    return identical ? [] : [{ kind: "replace", rows: wanted }];
  }
  // ordered before: order history points at the variant ids, so upsert by name instead
  const ops: VariantOp[] = [];
  const byName = new Map(existing.map((v) => [v.name, v]));
  for (const row of wanted) {
    const current = byName.get(row.name);
    if (!current) ops.push({ kind: "create", row });
    else if (!sameVariant(current, row)) ops.push({ kind: "update", id: current.id, row });
  }
  const names = new Set(wanted.map((v) => v.name));
  for (const v of existing) {
    if (names.has(v.name)) continue;
    if (v._count.orderItems === 0) ops.push({ kind: "delete", id: v.id });
    else if (v.stock !== 0 || v.position !== HIDDEN_POSITION) ops.push({ kind: "hide", id: v.id });
  }
  return ops;
}

function productData(p: ProductJson, categoryIds: Map<string, string>, supplierIds: Map<string, string>) {
  return {
    supplierId: supplierIds.get(p.supplier) ?? fail(`${p.sku}: supplier "${p.supplier}" is not in suppliers.json`),
    categoryId: categoryIds.get(p.category) ?? fail(`${p.sku}: category "${p.category}" is not in categories.json`),
    title: p.title,
    description: p.description,
    images: JSON.stringify(p.images),
    costPrice: p.costPrice,
    suggestedPrice: p.price,
    shippingDaysMin: p.shippingDaysMin,
    shippingDaysMax: p.shippingDaysMax,
    weightGrams: p.weightGrams,
    active: true,
  };
}
type ProductData = ReturnType<typeof productData>;
type ProductCreate = { sku: string; data: ProductData; variants: VariantRow[] };

/** Creates one file's new products and their variants in a single transaction. */
async function createProducts(creates: ProductCreate[]): Promise<{ id: string; sku: string }[]> {
  return db.$transaction(
    async (tx) => {
      const made = await tx.product.createManyAndReturn({ data: creates.map((c) => ({ ...c.data, sku: c.sku })), select: { id: true, sku: true } });
      const idOf = new Map(made.map((m) => [m.sku, m.id]));
      await tx.productVariant.createMany({ data: creates.flatMap((c) => c.variants.map((v) => ({ ...v, productId: idOf.get(c.sku)! }))) });
      return made;
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

/** Updates one product and its variants in a transaction. */
async function updateProduct(productId: string, data: ProductData | null, variantOps: VariantOp[]) {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (data) ops.push(db.product.update({ where: { id: productId }, data }));
  for (const op of variantOps) {
    if (op.kind === "replace") {
      ops.push(db.productVariant.deleteMany({ where: { productId } }));
      ops.push(db.productVariant.createMany({ data: op.rows.map((v) => ({ ...v, productId })) }));
    } else if (op.kind === "create") ops.push(db.productVariant.create({ data: { ...op.row, productId } }));
    else if (op.kind === "update") ops.push(db.productVariant.update({ where: { id: op.id }, data: op.row }));
    else if (op.kind === "hide") ops.push(db.productVariant.update({ where: { id: op.id }, data: { stock: 0, position: HIDDEN_POSITION } }));
    else ops.push(db.productVariant.delete({ where: { id: op.id } }));
  }
  await db.$transaction(ops);
}

async function syncProducts(files: ProductFile[], categoryIds: Map<string, string>, supplierIds: Map<string, string>) {
  const skus = files.flatMap((f) => f.products.map((p) => p.sku));
  // Upsert by SKU among the catalog suppliers' products, so a merchant-facing supplier's own SKU is never taken over
  const catalogSupplierIds = [...supplierIds.values()].filter((id) => !isPlaceholder(id));
  const existing =
    skus.length && catalogSupplierIds.length
      ? await db.product.findMany({
          where: { sku: { in: skus }, supplierId: { in: catalogSupplierIds } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sku: true,
            supplierId: true,
            categoryId: true,
            title: true,
            description: true,
            images: true,
            costPrice: true,
            suggestedPrice: true,
            shippingDaysMin: true,
            shippingDaysMax: true,
            weightGrams: true,
            active: true,
            variants: { select: { id: true, name: true, sku: true, costPrice: true, stock: true, position: true, _count: { select: { orderItems: true } } } },
          },
        })
      : [];
  const bySku = new Map<string, (typeof existing)[number]>();
  for (const p of existing) if (!bySku.has(p.sku)) bySku.set(p.sku, p); // the oldest wins if a SKU is duplicated

  const ids = new Map<string, string>(); // sku → product id
  console.log(files.length ? `\nProducts (${plural(files.length, "category file")}):` : "\nProducts: no prisma/catalog/products/*.json files yet.");

  // Plan every file first
  const plans = files.map((file, index) => {
    const creates: ProductCreate[] = [];
    const updates: { id: string; data: ProductData | null; variantOps: VariantOp[] }[] = [];
    let unchanged = 0;
    for (const p of file.products) {
      const data = productData(p, categoryIds, supplierIds);
      const variants = p.variants.map((v, i) => ({ name: v.name, sku: `${p.sku}-${i + 1}`, costPrice: p.costPrice, stock: v.stock, position: i }));
      const current = bySku.get(p.sku);
      if (!current) {
        creates.push({ sku: p.sku, data, variants });
        continue;
      }
      ids.set(p.sku, current.id);
      const productChanged = changed(current, data);
      const variantOps = planVariants(current.variants, variants);
      if (productChanged || variantOps.length) updates.push({ id: current.id, data: productChanged ? data : null, variantOps });
      else unchanged++;
    }
    return { file, index, creates, updates, unchanged, pending: (creates.length ? 1 : 0) + updates.length };
  });
  const report = (plan: (typeof plans)[number]) => {
    const { file, creates, updates, unchanged } = plan;
    const counts = [creates.length && `${creates.length} new`, updates.length && `${updates.length} updated`, unchanged && `${unchanged} unchanged`];
    console.log(
      `  [${String(plan.index + 1).padStart(2)}/${files.length}] ${file.name.padEnd(36)} ${counts.filter(Boolean).join(" · ") || "empty file"}` +
        (file.notImported ? `  (${file.notImported} more in the file, over the ${perCategory}-per-category limit)` : ""),
    );
  };

  if (DRY_RUN) {
    for (const plan of plans) {
      for (const c of plan.creates) ids.set(c.sku, placeholder(c.sku));
      report(plan);
    }
  } else {
    // Then write, a few transactions at a time: one per file for its new products, one per changed product.
    // A file's line prints as soon as its writes are done.
    const units = plans.flatMap((plan) => [
      ...(plan.creates.length ? [{ plan, run: async () => void (await createProducts(plan.creates)).forEach((m) => ids.set(m.sku, m.id)) }] : []),
      ...plan.updates.map((u) => ({ plan, run: () => updateProduct(u.id, u.data, u.variantOps) })),
    ]);
    for (const plan of plans) if (!plan.pending) report(plan);
    await mapLimit(units, CONCURRENCY, async ({ plan, run }) => {
      await run();
      if (--plan.pending === 0) report(plan);
    });
  }

  const sum = (pick: (p: (typeof plans)[number]) => number) => plans.reduce((s, p) => s + pick(p), 0);
  return {
    ids,
    created: sum((p) => p.creates.length),
    updated: sum((p) => p.updates.length),
    unchanged: sum((p) => p.unchanged),
    notImported: sum((p) => p.file.notImported),
  };
}

// ── 6. House-store listings ─────────────────────────────────

type ListingFields = { title: string; description: string; price: number; compareAtPrice: number | null; featured: boolean };

async function syncListings(houseId: string, files: ProductFile[], productIds: Map<string, string>, legacyIds: Set<string>) {
  const houseExists = !isPlaceholder(houseId);
  const catalogIds = [...productIds.values()].filter((id) => !isPlaceholder(id));
  const [houseListings, others] = await Promise.all([
    houseExists
      ? db.storeProduct.findMany({
          where: { storeId: houseId },
          select: { id: true, productId: true, slug: true, title: true, description: true, price: true, compareAtPrice: true, featured: true },
        })
      : [],
    // every other active product of an approved supplier (the legacy demo products and anything suppliers added)
    db.product.findMany({
      where: { active: true, supplier: { status: "APPROVED" }, id: { notIn: catalogIds } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        suggestedPrice: true,
        storeProducts: {
          where: houseExists ? { storeId: { not: houseId } } : {},
          orderBy: { createdAt: "asc" },
          select: { price: true, compareAtPrice: true, featured: true, active: true, store: { select: { published: true } } },
        },
      },
    }),
  ]);

  // Wanted listings. `sync`: re-runs update the listing (catalog products from their file, legacy demo products
  // from their other listing); listings of products suppliers added themselves are created once and left alone.
  const wanted: (ListingFields & { productId: string; sync: boolean })[] = files.flatMap((f) =>
    f.products.map((p) => ({
      productId: productIds.get(p.sku)!,
      title: p.title,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      featured: p.featured,
      sync: true,
    })),
  );
  for (const p of others) {
    // its listing in another store (an active one in a published store first, then the oldest) sets the price
    const source = [...p.storeProducts].sort((a, b) => Number(b.active && b.store.published) - Number(a.active && a.store.published))[0];
    wanted.push({
      productId: p.id,
      title: p.title,
      description: p.description,
      price: source?.price ?? p.suggestedPrice,
      compareAtPrice: source?.compareAtPrice && source.compareAtPrice > source.price ? source.compareAtPrice : null,
      featured: source?.featured ?? false,
      sync: legacyIds.has(p.id),
    });
  }

  const byProduct = new Map(houseListings.map((l) => [l.productId, l]));
  const usedSlugs = new Set(houseListings.map((l) => l.slug));
  const uniqueSlug = (title: string) => {
    const base = slugify(title);
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);
    return slug;
  };

  const creates: Prisma.StoreProductCreateManyInput[] = [];
  const updates: { id: string; data: ListingFields }[] = [];
  let unchanged = 0;
  for (const { productId, sync, ...fields } of wanted) {
    const current = byProduct.get(productId);
    if (!current) creates.push({ storeId: houseId, productId, slug: uniqueSlug(fields.title), active: true, ...fields });
    else if (sync && changed(current, fields)) updates.push({ id: current.id, data: fields });
    else unchanged++;
  }
  if (!DRY_RUN) {
    if (creates.length) await db.storeProduct.createMany({ data: creates });
    await mapLimit(updates, CONCURRENCY, (u) => db.storeProduct.update({ where: { id: u.id }, data: u.data }));
  }
  return { created: creates.length, updated: updates.length, unchanged };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  console.log(`olozzo catalog seed${DRY_RUN ? " (DRY RUN: nothing will be written)" : ""}`);
  console.log(`Imports up to ${perCategory} products per category file${perCategory === DEFAULT_PER_CATEGORY ? " (--per-category=N changes this)" : ""}.\n`);

  validateCatalog();
  const tree = readJson<CategoryJson[]>(path.join(CATALOG_DIR, "categories.json"));
  const supplierRows = readJson<SupplierJson[]>(path.join(CATALOG_DIR, "suppliers.json"));
  const files = readProductFiles(tree);
  const catalogSkus = new Set(files.flatMap((f) => f.products.map((p) => p.sku)));

  // The house store, categories and suppliers don't depend on each other: sync them side by side
  const houseState = await checkHouseStore();
  const [house, categories, suppliers] = await Promise.all([ensureHouseStore(houseState), syncCategories(tree), syncSuppliers(supplierRows)]);
  console.log(`House store: ${house.notes.join("; ")}`);
  console.log(`Categories: ${categories.created} new · ${categories.updated} updated · ${categories.renamed} renamed (${categories.total} in categories.json)`);
  console.log(`Suppliers: ${suppliers.created} new · ${suppliers.updated} updated · ${suppliers.unchanged} unchanged`);

  const legacy = await moveLegacyProducts(categories.ids, catalogSkus);
  const fashion = await removeLegacyFashion(categories, legacy.movedIds);
  console.log(
    `Demo products: ${legacy.movedIds.length} of ${legacy.ids.size} ${DRY_RUN ? "would move" : "moved"} into subcategories` +
      (legacy.missing.length ? ` · not found (skipped): ${legacy.missing.join(", ")}` : "") +
      ` · legacy "${LEGACY_FASHION_SLUG}" category: ${fashion}`,
  );
  for (const w of legacy.warnings) console.log(`  WARN ${w}`);

  const products = await syncProducts(files, categories.ids, suppliers.ids);
  const listings = await syncListings(house.id, files, products.ids, legacy.ids);
  console.log(`\nHouse-store listings: ${listings.created} new · ${listings.updated} updated · ${listings.unchanged} unchanged`);

  console.log(`\nSummary${DRY_RUN ? " (dry run: counts are what a real run would do)" : ""}`);
  console.log(`  categories  ${categories.created} created · ${categories.updated} updated · ${categories.renamed} renamed`);
  console.log(`  suppliers   ${suppliers.created} created · ${suppliers.updated} updated`);
  console.log(
    `  products    ${products.created} created · ${products.updated} updated · ${products.unchanged} unchanged` +
      (products.notImported ? ` · ${products.notImported} left out (over ${perCategory} per category)` : ""),
  );
  console.log(`  listings    ${listings.created} created · ${listings.updated} updated in the "${HOUSE_STORE_SLUG}" store`);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (DRY_RUN) console.log(`\nNothing was written (${seconds} s). Run without --dry-run to apply.`);
  else console.log(`\nDone in ${seconds} s. The shop's cached category menu refreshes within 5 minutes.`);
}

main()
  .catch((e) => {
    console.error(e instanceof SeedError ? `\n${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (newHousePassword) console.log(`\nHouse store login: ${HOUSE_EMAIL} / ${newHousePassword}\n(shown only this once: keep it somewhere safe)`);
    await db.$disconnect();
  });
