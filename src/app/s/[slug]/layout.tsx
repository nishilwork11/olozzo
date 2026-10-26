import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, ShieldCheck, Truck, RotateCcw, User } from "lucide-react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { CartProvider } from "@/components/store/CartProvider";
import { CartButton } from "@/components/store/StoreClient";
import { getCurrentUser } from "@/lib/auth";
import { HOUSE_STORE_SLUG } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { getStorefront } from "@/lib/store";
import { UI } from "@/lib/theme";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store) return { title: "Store not found" };
  return { title: { default: store.name, template: `%s · ${store.name}` }, description: store.tagline ?? store.description ?? undefined };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [store, user] = await Promise.all([getStorefront(slug), getCurrentUser()]);
  if (!store) notFound();

  const previewBanner = !store.published && (
    <div className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
      Preview — this store is unpublished and only visible to you.
    </div>
  );

  // olozzo's own store is the shop itself: product → cart → checkout keep the site header and footer
  if (store.slug === HOUSE_STORE_SLUG) {
    return (
      <CartProvider storeSlug={store.slug}>
        {/* olozzo's own store follows the site theme, whatever accent is saved in its settings */}
        <div style={{ "--accent": UI.action } as React.CSSProperties} className="flex min-h-screen flex-col">
          {previewBanner}
          <SiteHeader liveCart />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </CartProvider>
    );
  }

  return (
    <CartProvider storeSlug={store.slug}>
      <div style={{ "--accent": store.accentColor } as React.CSSProperties} className="flex min-h-screen flex-col">
        {previewBanner}
        <div className="px-4 py-2 text-center text-xs font-medium text-white" style={{ background: "var(--accent)" }}>
          {store.freeShippingOver !== null ? `Free EU shipping on orders over ${formatMoney(store.freeShippingOver)}` : "Fast shipping from EU warehouses"} · 14-day returns
        </div>
        <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
            <Link href={`/s/${store.slug}`} className="flex shrink-0 items-center gap-2.5">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-lg font-bold text-white" style={{ background: "var(--accent)" }}>
                  {store.name.charAt(0)}
                </span>
              )}
              <span className="text-lg font-bold tracking-tight">{store.name}</span>
            </Link>
            <form action={`/s/${store.slug}`} className="relative mx-auto hidden w-full max-w-md md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
              <input name="q" placeholder={`Search ${store.name}`} className="input rounded-full pl-9" />
            </form>
            <div className="ml-auto flex items-center gap-1">
              <Link href={user ? "/account" : `/login?next=/s/${store.slug}`} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink-100" aria-label="Account">
                <User size={20} />
              </Link>
              <CartButton />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <section className="border-t border-ink-100 bg-ink-50">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {[
              { icon: Truck, t: "Fast EU delivery", d: "Shipped from European warehouses — no customs fees." },
              { icon: RotateCcw, t: "14-day returns", d: "Changed your mind? Request a return from your account." },
              { icon: ShieldCheck, t: "Secure checkout", d: "Cards, SEPA, iDEAL, Bancontact, Klarna & more." },
            ].map((b) => (
              <div key={b.t} className="flex gap-3">
                <b.icon className="shrink-0 text-accent" size={22} />
                <div>
                  <p className="font-semibold">{b.t}</p>
                  <p className="text-sm text-ink-500">{b.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <footer className="border-t border-ink-100">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="font-semibold text-ink-900">{store.name}</p>
              {store.supportEmail && <p>Support: {store.supportEmail}</p>}
            </div>
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/legal/terms" className="hover:text-ink-900">Terms</Link>
              <Link href="/legal/privacy" className="hover:text-ink-900">Privacy</Link>
              <Link href="/legal/withdrawal" className="hover:text-ink-900">Returns & withdrawal</Link>
              <Link href="/legal/imprint" className="hover:text-ink-900">Imprint</Link>
            </nav>
            <Link href="/" className="text-xs hover:text-ink-900">
              Powered by <span className="font-bold">olozzo</span>
            </Link>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
