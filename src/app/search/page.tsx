import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { CategoryTile } from "@/components/shop/CategoryStrip";
import { Pagination, hrefWith, type QueryParams } from "@/components/shop/Pagination";
import { DealsToggle, PriceFilter, chipClass, readPriceRange } from "@/components/shop/PriceFilter";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { RailScroller } from "@/components/shop/ProductRail";
import { Breadcrumbs } from "@/components/shop/SectionHeader";
import { SortSelect } from "@/components/shop/SortSelect";
import { SHOP_SORTS, getCategory, getCategoryTree, getShopListings, type CategoryNode, type ShopSort } from "@/lib/catalog";

const PAGE_SIZE = 40;
/** How many matches are looked at to find the categories a search has results in */
const FACET_SAMPLE = 100;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const searchTerm = (value: string | string[] | undefined) => first(value)?.trim().slice(0, 100) || undefined;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  return {
    title: q ? `Search: ${q}` : first(sp.deals) === "1" ? "Deals" : "Search",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const categoryParam = first(sp.category);
  const sortParam = first(sp.sort);
  const sort = (SHOP_SORTS.some((s) => s.value === sortParam) ? sortParam : "recommended") as ShopSort;
  const price = readPriceRange(first(sp.min), first(sp.max));
  const dealsOnly = first(sp.deals) === "1";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const [tree, found] = await Promise.all([getCategoryTree(), categoryParam ? getCategory(categoryParam) : null]);
  const category = found?.category ?? null; // an unknown ?category= is ignored
  const filters = { q, minPrice: price.minPrice, maxPrice: price.maxPrice, dealsOnly };
  const narrowed = Boolean(q || price.min || price.max || dealsOnly);

  const [result, sample] = await Promise.all([
    getShopListings({ ...filters, category: category?.slug, sort, page, pageSize: PAGE_SIZE }),
    // Which top-level categories the search has results in (from the first matches, in every category)
    narrowed ? getShopListings({ ...filters, pageSize: FACET_SAMPLE }) : null,
  ]);

  const topOf = new Map<string, CategoryNode>();
  for (const root of tree) {
    topOf.set(root.slug, root);
    for (const child of root.children) topOf.set(child.slug, root);
  }
  let chipCategories: CategoryNode[];
  if (sample) {
    const hits = new Map<string, number>();
    for (const item of sample.items) {
      const root = item.category && topOf.get(item.category.slug);
      if (root) hits.set(root.slug, (hits.get(root.slug) ?? 0) + 1);
    }
    chipCategories = tree.filter((c) => hits.has(c.slug)).sort((a, b) => hits.get(b.slug)! - hits.get(a.slug)!);
  } else {
    chipCategories = tree.filter((c) => c.productCount > 0);
  }
  // keep the selected category's chip visible even when it isn't among the sampled matches
  const selectedRoot = category ? topOf.get(category.slug) : undefined;
  if (selectedRoot && !chipCategories.includes(selectedRoot)) chipCategories = [selectedRoot, ...chipCategories];

  const path = "/search";
  const query: QueryParams = {
    q,
    category: category?.slug,
    sort: sort === "recommended" ? undefined : sort,
    min: price.min,
    max: price.max,
    deals: dealsOnly ? "1" : undefined,
  };
  const filtered = Boolean(price.min || price.max || dealsOnly);
  const clearHref = hrefWith(path, { q, category: query.category, sort: query.sort });
  const title = q ? `Results for “${q}”` : dealsOnly ? "Deals" : category ? category.name : "All products";
  const popularCategories = [...tree]
    .filter((c) => c.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 12);

  return (
    <>
      <SiteHeader />
      <main className="bg-ink-50">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          {/* The search box itself is in the site header (pre-filled with the query on this page) */}
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: q || !dealsOnly ? "Search" : "Deals" }]} />

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{title}</h1>
            <p className="text-sm text-ink-500" aria-live="polite">
              {result.total} {result.total === 1 ? "result" : "results"}
              {category && (q || dealsOnly) ? ` in ${category.name}` : ""}
            </p>
          </div>
          {dealsOnly && !q && <p className="mt-1 text-sm text-ink-500">Products currently priced below their regular price.</p>}

          {chipCategories.length > 0 && (
            <nav aria-label="Narrow down by category" className="mt-3">
              <RailScroller label="Categories" revealCurrent className="-mx-3 flex gap-2 px-3 py-1 sm:mx-0 sm:px-0">
                <li className="shrink-0">
                  <Link href={hrefWith(path, query, { category: undefined, page: undefined })} aria-current={!category ? "true" : undefined} className={chipClass(!category)}>
                    All categories
                  </Link>
                </li>
                {category && selectedRoot && category.slug !== selectedRoot.slug && (
                  <li className="shrink-0">
                    <Link href={hrefWith(path, query, { category: undefined, page: undefined })} aria-current="true" className={chipClass(true)}>
                      {category.name}
                    </Link>
                  </li>
                )}
                {chipCategories.map((c) => {
                  const active = category?.slug === c.slug;
                  return (
                    <li key={c.id} className="shrink-0">
                      <Link
                        href={hrefWith(path, query, { category: active ? undefined : c.slug, page: undefined })}
                        aria-current={active ? "true" : undefined}
                        className={chipClass(active)}
                      >
                        {c.name}
                      </Link>
                    </li>
                  );
                })}
              </RailScroller>
            </nav>
          )}

          <section aria-label="Search results" className="mt-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink-200/70 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 border-b border-ink-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative -mx-3 flex items-center gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
                <DealsToggle path={path} params={query} active={dealsOnly} />
                <span className="h-5 w-px shrink-0 bg-ink-200" aria-hidden="true" />
                <PriceFilter path={path} params={query} min={price.min} max={price.max} />
                {filtered && (
                  <Link href={clearHref} className="shrink-0 whitespace-nowrap rounded px-1 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    Clear filters
                  </Link>
                )}
              </div>
              <SortSelect action={path} value={sort} options={SHOP_SORTS} hidden={{ ...query, sort: undefined }} className="shrink-0" />
            </div>

            {result.items.length > 0 ? (
              <>
                <ProductGrid items={result.items} label="Search results" eager={6} />
                <Pagination className="mt-8" page={result.page} pageCount={result.pageCount} path={path} params={query} />
              </>
            ) : (
              <div className="px-2 py-10 text-center sm:px-6">
                <SearchX className="mx-auto text-ink-400" size={32} aria-hidden="true" />
                <h2 className="mt-3 text-lg font-semibold text-ink-900">No results{q ? ` for “${q}”` : ""}</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                  Check the spelling or try fewer, more general words{filtered || category ? ", or remove a filter" : ""}.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {filtered && (
                    <Link href={clearHref} className="btn btn-secondary">
                      Clear filters
                    </Link>
                  )}
                  {category && (
                    <Link href={hrefWith(path, query, { category: undefined, page: undefined })} className="btn btn-secondary">
                      Search all categories
                    </Link>
                  )}
                </div>
                {popularCategories.length > 0 && (
                  <div className="mt-10">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Popular categories</h3>
                    <ul className="mx-auto mt-4 grid max-w-3xl grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-6">
                      {popularCategories.map((c) => (
                        <li key={c.id}>
                          <CategoryTile href={`/c/${c.slug}`} name={c.name} image={c.image} icon={c.icon} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
