import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { AutoSubmitSelect } from "@/components/client";
import { ProductCard } from "@/components/store/ProductCard";
import { db } from "@/lib/db";
import { variantRetailPrice } from "@/lib/pricing";
import { getStorefront } from "@/lib/store";
import { cn, parseImages } from "@/lib/utils";

const SORTS = {
  featured: { label: "Featured", orderBy: [{ featured: "desc" }, { createdAt: "asc" }] },
  newest: { label: "Newest", orderBy: [{ createdAt: "desc" }] },
  "price-asc": { label: "Price: low to high", orderBy: [{ price: "asc" }] },
  "price-desc": { label: "Price: high to low", orderBy: [{ price: "desc" }] },
} satisfies Record<string, { label: string; orderBy: Prisma.StoreProductOrderByWithRelationInput[] }>;

type SortKey = keyof typeof SORTS;

export default async function StoreHome({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const { q, category, sort } = await searchParams;
  const store = await getStorefront(slug);
  if (!store) notFound();

  const sortKey: SortKey = sort && sort in SORTS ? (sort as SortKey) : "featured";
  const baseWhere: Prisma.StoreProductWhereInput = {
    storeId: store.id,
    active: true,
    product: { active: true, supplier: { status: "APPROVED" } },
  };
  const where: Prisma.StoreProductWhereInput = {
    ...baseWhere,
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    ...(category ? { product: { active: true, supplier: { status: "APPROVED" }, category: { slug: category } } } : {}),
  };

  const [products, categories] = await Promise.all([
    db.storeProduct.findMany({ where, include: { product: { include: { variants: { where: { position: { lt: 999 } } } } } }, orderBy: SORTS[sortKey].orderBy }),
    db.category.findMany({ where: { products: { some: { storeProducts: { some: baseWhere } } } }, orderBy: { name: "asc" } }),
  ]);

  const filtered = Boolean(q || category);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { q, category, sort, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/s/${store.slug}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      {!filtered && (
        <section className="relative overflow-hidden">
          {store.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--accent), #0f172a)" }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
          <div className="relative mx-auto max-w-7xl px-4 py-24 text-white sm:px-6 md:py-32">
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight md:text-6xl">{store.tagline ?? store.name}</h1>
            {store.description && <p className="mt-5 max-w-xl text-lg text-white/85">{store.description}</p>}
            <a href="#products" className="btn btn-lg mt-8 bg-white text-ink-900 hover:bg-ink-100">
              Shop now
            </a>
          </div>
        </section>
      )}

      <section id="products" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-bold tracking-tight">
            {q ? `Results for “${q}”` : category ? categories.find((c) => c.slug === category)?.name ?? "Products" : "All products"}
            <span className="ml-2 text-base font-normal text-ink-400">({products.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={qs({ category: undefined })} className={cn("rounded-full border px-3.5 py-1.5 text-sm", !category ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 hover:border-ink-400")}>
              All
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={qs({ category: c.slug })}
                className={cn("rounded-full border px-3.5 py-1.5 text-sm", category === c.slug ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 hover:border-ink-400")}
              >
                {c.name}
              </Link>
            ))}
            <form action={`/s/${store.slug}`} className="ml-1">
              {q && <input type="hidden" name="q" value={q} />}
              {category && <input type="hidden" name="category" value={category} />}
              <AutoSubmitSelect
                name="sort"
                defaultValue={sortKey}
                className="input w-auto rounded-full py-1.5"
                options={Object.entries(SORTS).map(([value, v]) => ({ value, label: v.label }))}
              />
              <noscript>
                <button className="btn btn-secondary btn-sm ml-2">Sort</button>
              </noscript>
            </form>
          </div>
        </div>

        {/* Mobile search */}
        <form action={`/s/${store.slug}`} className="mt-4 md:hidden">
          <input name="q" defaultValue={q} placeholder="Search products" className="input rounded-full" />
        </form>

        {products.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-ink-300 py-16 text-center text-ink-500">
            No products found.{" "}
            <Link href={`/s/${store.slug}`} className="font-semibold text-accent hover:underline">
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {products.map((sp) => {
              const prices = sp.product.variants.map((v) => variantRetailPrice(sp.price, sp.product.costPrice, v.costPrice));
              const minPrice = prices.length ? Math.min(...prices) : sp.price;
              return (
                <ProductCard
                  key={sp.id}
                  href={`/s/${store.slug}/products/${sp.slug}`}
                  title={sp.title}
                  image={parseImages(sp.product.images)[0]}
                  price={minPrice}
                  compareAtPrice={sp.compareAtPrice}
                  hasVariants={new Set(prices).size > 1}
                  soldOut={sp.product.variants.every((v) => v.stock <= 0)}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

