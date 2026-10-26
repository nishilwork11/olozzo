import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageOpen, SearchX } from "lucide-react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { categoryIcon } from "@/components/shop/CategoryIcon";
import { CategoryTile } from "@/components/shop/CategoryStrip";
import { Pagination, hrefWith, type QueryParams } from "@/components/shop/Pagination";
import { DealsToggle, PriceFilter, chipClass, readPriceRange } from "@/components/shop/PriceFilter";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { RailScroller } from "@/components/shop/ProductRail";
import { Breadcrumbs } from "@/components/shop/SectionHeader";
import { SortSelect } from "@/components/shop/SortSelect";
import { SHOP_SORTS, getCategory, getShopListings, subcategoryLabel, type ShopSort } from "@/lib/catalog";

const PAGE_SIZE = 40;

type RouteParams = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getCategory(slug);
  if (!found) return { title: "Category not found" };
  const { category, parent } = found;
  return {
    title: category.name,
    description: `Shop ${category.name}${parent ? ` in ${parent.name}` : ""} at olozzo. Prices include VAT, shipped from EU warehouses, with 14-day returns.`,
  };
}

export default async function CategoryPage({ params, searchParams }: { params: RouteParams; searchParams: SearchParams }) {
  const { slug } = await params;
  const found = await getCategory(slug);
  if (!found) notFound();
  const { category, parent } = found;

  const sp = await searchParams;
  const sortParam = first(sp.sort);
  const sort = (SHOP_SORTS.some((s) => s.value === sortParam) ? sortParam : "recommended") as ShopSort;
  const price = readPriceRange(first(sp.min), first(sp.max));
  const dealsOnly = first(sp.deals) === "1";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const result = await getShopListings({
    category: category.slug,
    sort,
    page,
    pageSize: PAGE_SIZE,
    minPrice: price.minPrice,
    maxPrice: price.maxPrice,
    dealsOnly,
  });

  const path = `/c/${category.slug}`;
  // The current filters, cleaned up — every filter link and form keeps the others
  const query: QueryParams = {
    sort: sort === "recommended" ? undefined : sort,
    min: price.min,
    max: price.max,
    deals: dealsOnly ? "1" : undefined,
  };
  const filtered = Boolean(price.min || price.max || dealsOnly);
  const clearHref = hrefWith(path, { sort: query.sort });
  const top = parent ?? category;
  const Icon = categoryIcon(top.icon);

  return (
    <>
      <SiteHeader />
      <main className="bg-ink-50">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              ...(parent ? [{ label: parent.name, href: `/c/${parent.slug}` }] : []),
              { label: category.name },
            ]}
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <Icon size={20} aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{category.name}</h1>
            <p className="text-sm text-ink-500">
              {result.total} {result.total === 1 ? "product" : "products"}
              {filtered && " match your filters"}
            </p>
          </div>

          {!parent && category.children.length > 0 && (
            <nav aria-label={`Shop ${category.name} by category`} className="mt-4 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-ink-200/70 sm:p-4">
              <RailScroller label={`${category.name} categories`} className="-m-1 flex snap-x gap-1 p-1 lg:flex-wrap">
                {category.children.map((child) => (
                  <li key={child.id} className="w-20 shrink-0 snap-start sm:w-[92px]">
                    <CategoryTile href={`/c/${child.slug}`} name={subcategoryLabel(child.name, category.name)} image={child.image} icon={category.icon} />
                  </li>
                ))}
              </RailScroller>
            </nav>
          )}

          {parent && (
            <nav aria-label={`More in ${parent.name}`} className="mt-4">
              <RailScroller label={`${parent.name} categories`} revealCurrent className="-mx-3 flex gap-2 px-3 py-1 sm:mx-0 sm:flex-wrap sm:px-0">
                <li className="shrink-0">
                  <Link href={`/c/${parent.slug}`} className={chipClass(false)}>
                    All {parent.name}
                  </Link>
                </li>
                {parent.children.map((sibling) => {
                  const current = sibling.id === category.id;
                  return (
                    <li key={sibling.id} className="shrink-0">
                      <Link href={`/c/${sibling.slug}`} aria-current={current ? "page" : undefined} className={chipClass(current)}>
                        {subcategoryLabel(sibling.name, parent.name)}
                      </Link>
                    </li>
                  );
                })}
              </RailScroller>
            </nav>
          )}

          <section aria-label={`${category.name} products`} className="mt-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink-200/70 sm:p-5">
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
                <ProductGrid items={result.items} label={`${category.name} products`} eager={6} />
                <Pagination className="mt-8" page={result.page} pageCount={result.pageCount} path={path} params={query} />
              </>
            ) : filtered ? (
              <div className="px-6 py-14 text-center">
                <SearchX className="mx-auto text-ink-400" size={32} aria-hidden="true" />
                <p className="mt-3 font-semibold text-ink-900">No products match these filters</p>
                <p className="mt-1 text-sm text-ink-500">Try another price range or show all products in {category.name}.</p>
                <Link href={clearHref} className="btn btn-primary mt-5">
                  Clear filters
                </Link>
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <PackageOpen className="mx-auto text-ink-400" size={32} aria-hidden="true" />
                <p className="mt-3 font-semibold text-ink-900">No products in {category.name} yet</p>
                <p className="mt-1 text-sm text-ink-500">We're still stocking this category. Please check back soon.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {parent && (
                    <Link href={`/c/${parent.slug}`} className="btn btn-secondary">
                      All {parent.name}
                    </Link>
                  )}
                  <Link href="/" className="btn btn-primary">
                    Explore the shop
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
