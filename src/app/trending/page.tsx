import type { Metadata } from "next";
import Link from "next/link";
import { Flame, PackageOpen } from "lucide-react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { Breadcrumbs } from "@/components/shop/SectionHeader";
import { getTrending } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Trending now",
  description: "The products shoppers are searching for most this month, shipped from EU warehouses.",
};
export const dynamic = "force-dynamic";

export default async function TrendingPage() {
  const items = await getTrending();

  return (
    <>
      <SiteHeader />
      <main className="bg-ink-50">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Trending now" }]} />

          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
              <Flame size={22} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">Trending now</h1>
              <p className="text-sm text-ink-500">
                {items.length > 0 ? `The top ${items.length} products shoppers are searching for this month.` : "What shoppers are searching for this month."}
              </p>
            </div>
          </div>

          <section aria-label="Trending products" className="mt-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink-200/70 sm:p-5">
            {items.length > 0 ? (
              <ProductGrid items={items} label="Trending products" eager={6} ranked />
            ) : (
              <div className="px-2 py-14 text-center">
                <PackageOpen className="mx-auto text-ink-400" size={32} aria-hidden="true" />
                <p className="mt-3 font-semibold text-ink-900">The trending list is being updated</p>
                <p className="mt-1 text-sm text-ink-500">Please check back soon.</p>
                <Link href="/" className="btn btn-secondary mt-5">
                  Back to the shop
                </Link>
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
