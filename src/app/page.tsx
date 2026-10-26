import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Compass,
  Globe,
  MapPinned,
  PackageOpen,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";
import { PlatformLanding } from "@/components/marketing/PlatformLanding";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { categoryIcon } from "@/components/shop/CategoryIcon";
import { CategoryStrip } from "@/components/shop/CategoryStrip";
import { DealsCountdown } from "@/components/shop/DealsCountdown";
import { Pagination } from "@/components/shop/Pagination";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { ProductRail } from "@/components/shop/ProductRail";
import { SectionHeader } from "@/components/shop/SectionHeader";
import { ProductCard } from "@/components/store/ProductCard";
import {
  getCategoryTree,
  getDeals,
  getNewArrivals,
  getPopular,
  getShopListings,
  nextDealsRefresh,
  type ShopListing,
} from "@/lib/catalog";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DEALS_HREF = "/search?deals=1&sort=discount";
const EXPLORE_PAGE_SIZE = 40;
/** Card widths in the product rails (see ProductRail) */
const RAIL_SIZES = "(min-width: 1024px) 192px, (min-width: 640px) 160px, 136px";

const BENEFITS = [
  { icon: Warehouse, title: "EU warehouses", text: "No customs fees" },
  { icon: Receipt, title: "VAT included", text: "In every price" },
  { icon: RotateCcw, title: "14-day returns", text: "After delivery" },
  { icon: ShieldCheck, title: "Secure payment", text: "Via Stripe or Mollie" },
];

const TRUST = [
  { icon: Receipt, title: "VAT included", text: "Your country's rate is applied at checkout." },
  { icon: Globe, title: "No customs fees", text: "Everything ships from inside the EU." },
  { icon: MapPinned, title: "27 EU countries", text: "We deliver to every EU member state." },
  { icon: Truck, title: "Tracked delivery", text: "Follow every parcel from your account." },
  { icon: RotateCcw, title: "14-day returns", text: "Change your mind after delivery." },
  { icon: ShieldCheck, title: "Secure payments", text: "Card details never touch our servers." },
];

const FAQ = [
  { q: "How long does delivery take?", a: "Most orders arrive in 2–6 business days. Products ship from warehouses inside the EU, so there are no customs fees." },
  { q: "Which countries do you deliver to?", a: "All 27 EU member states. The VAT rate of your country is applied automatically at checkout." },
  { q: "Do I need an account to order?", a: "No, you can check out as a guest. With an account your details are filled in at checkout and all your orders and tracking are in one place." },
  { q: "How can I pay?", a: "By credit or debit card, SEPA, iDEAL, Bancontact or Klarna. Payments are processed securely by Stripe and Mollie." },
  { q: "Why did my order arrive in more than one parcel?", a: "If your order includes products from different warehouses, each warehouse ships its part separately with its own tracking number." },
  { q: "Can I return a product?", a: "Yes. You have 14 days after delivery to withdraw from your purchase. Request the return from your account and you are refunded once it is approved." },
];

function Panel({ id, title, className, children }: { id: string; title?: string; className?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={title ? `${id}-title` : undefined}
      className={cn("rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink-200/70 sm:p-5", className)}
    >
      {children}
    </section>
  );
}

function Rail({
  id,
  title,
  icon,
  href,
  linkLabel,
  items,
  extra,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  href?: string;
  linkLabel?: string;
  items: ShopListing[];
  extra?: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <Panel id={id} title={title}>
      <SectionHeader id={`${id}-title`} title={title} icon={icon} href={href} linkLabel={linkLabel} className="mb-3">
        {extra}
      </SectionHeader>
      <ProductRail label={title}>
        {items.map((listing) => (
          <ProductCard key={listing.id} listing={listing} sizes={RAIL_SIZES} />
        ))}
      </ProductRail>
    </Panel>
  );
}

function Hero({ picks, hasDeals }: { picks: ShopListing[]; hasDeals: boolean }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-700 to-emerald-900 text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(167,243,208,0.28),transparent_45%),radial-gradient(circle_at_0%_100%,rgba(190,242,100,0.2),transparent_40%)]"
      />
      <div className={cn("relative grid items-center gap-8 p-5 sm:p-8 lg:p-10", picks.length === 3 && "lg:grid-cols-[1.1fr_1fr]")}>
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-50 ring-1 ring-white/20">
            <Sparkles size={14} aria-hidden="true" /> Delivering to all 27 EU countries
          </p>
          <h2 id="hero-title" className="mt-3 max-w-xl text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Everyday finds, shipped from European warehouses
          </h2>
          <ul className={cn("mt-5 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4", picks.length === 3 && "lg:grid-cols-2")}>
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-2 rounded-xl bg-white/10 p-2.5 ring-1 ring-white/15">
                <b.icon size={18} className="mt-0.5 shrink-0 text-lime-300" aria-hidden="true" />
                <span className="leading-tight">
                  <span className="block text-sm font-semibold">{b.title}</span>
                  <span className="text-xs text-brand-50">{b.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={hasDeals ? DEALS_HREF : "#explore"}
            className="btn btn-lg mt-6 bg-white text-brand-800 hover:bg-brand-50 focus-visible:ring-white focus-visible:ring-offset-brand-700"
          >
            {hasDeals ? "Shop today's deals" : "Start exploring"} <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        {picks.length === 3 && (
          <ul aria-label="A few of today's deals" className="hidden grid-cols-3 gap-3 lg:grid">
            {picks.map((listing) => (
              <li key={listing.id} className="rounded-xl bg-white p-2 text-ink-900 shadow-lg">
                <ProductCard listing={listing} sizes="180px" eager />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (OPEN_STORE_ENABLED) return <PlatformLanding />;

  const pageParam = (await searchParams).page;
  const page = Math.max(1, Number.parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) ?? "1", 10) || 1);

  const tree = await getCategoryTree();
  // The six top-level categories with the most products get a rail of their own
  const railCategories = tree
    .filter((c) => c.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 6);

  const [deals, popular, arrivals, explore, categoryRails] = await Promise.all([
    getDeals(12),
    getPopular(12),
    getNewArrivals(12),
    getShopListings({ page, pageSize: EXPLORE_PAGE_SIZE }),
    Promise.all(railCategories.map((c) => getShopListings({ category: c.slug, pageSize: 10 }))),
  ]);
  const heroPicks = [...deals].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main className="bg-ink-50">
        <h1 className="sr-only">olozzo: everyday products with fast delivery from EU warehouses</h1>
        <div className="mx-auto max-w-7xl space-y-3 px-3 py-3 sm:space-y-5 sm:px-6 sm:py-5">
          {tree.length > 0 && (
            <nav id="categories" aria-label="Shop by category" className="scroll-mt-32 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-ink-200/70 sm:p-4">
              <CategoryStrip categories={tree} label="Categories" />
            </nav>
          )}

          <Hero picks={heroPicks.length === 3 ? heroPicks : []} hasDeals={deals.length > 0} />

          <Rail
            id="deals"
            title="Today's deals"
            icon={BadgePercent}
            href={DEALS_HREF}
            linkLabel="See all deals"
            items={deals}
            extra={<DealsCountdown until={nextDealsRefresh().toISOString()} />}
          />
          <Rail id="popular" title="Popular right now" icon={TrendingUp} items={popular} />
          <Rail id="new" title="New arrivals" icon={PackageOpen} href="/search?sort=newest" items={arrivals} />
          {railCategories.map((c, i) => (
            <Rail key={c.id} id={`cat-${c.slug}`} title={c.name} icon={categoryIcon(c.icon)} href={`/c/${c.slug}`} items={categoryRails[i].items} />
          ))}

          <Panel id="explore" title="Explore more" className="scroll-mt-32">
            <SectionHeader id="explore-title" title="Explore more" icon={Compass} className="mb-4">
              {explore.total > 0 && (
                <p className="text-sm text-ink-500">
                  {explore.total} {explore.total === 1 ? "product" : "products"}
                </p>
              )}
            </SectionHeader>
            {explore.items.length > 0 ? (
              <>
                <ProductGrid items={explore.items} label="More products" />
                <Pagination className="mt-8" page={explore.page} pageCount={explore.pageCount} path="/" params={{}} anchor="explore" />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-ink-300 px-6 py-14 text-center">
                <PackageOpen className="mx-auto text-ink-400" size={32} aria-hidden="true" />
                <p className="mt-3 font-semibold text-ink-900">No products to show yet</p>
                <p className="mt-1 text-sm text-ink-500">Our range is being stocked. Please check back soon.</p>
              </div>
            )}
          </Panel>

          <section aria-label="Why shop at olozzo" className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink-200/70 sm:p-5">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
              {TRUST.map((t) => (
                <li key={t.title} className="flex items-start gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                    <t.icon size={18} aria-hidden="true" />
                  </span>
                  <span className="leading-snug">
                    <span className="block text-sm font-semibold text-ink-900">{t.title}</span>
                    <span className="text-xs text-ink-500">{t.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-32 border-t border-ink-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
            <h2 id="faq-title" className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-8 divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white">
              {FAQ.map((item) => (
                <details key={item.q} className="group px-5 py-4 sm:px-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    {item.q}
                    <span className="text-xl leading-none text-ink-400 transition group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-ink-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
