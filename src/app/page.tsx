import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Globe,
  Lock,
  Percent,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Truck,
} from "lucide-react";
import { PlatformLanding } from "@/components/marketing/PlatformLanding";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { ProductCard } from "@/components/store/ProductCard";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { formatMoney } from "@/lib/money";
import { variantRetailPrice } from "@/lib/pricing";
import { cn, parseImages } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: Search, title: "Find what you like", text: "Browse by category or see the whole range at once. Every price already includes VAT." },
  { icon: CreditCard, title: "Pay securely", text: "Check out as a guest or with your account, by card, SEPA, iDEAL, Bancontact or Klarna." },
  { icon: Truck, title: "We ship it to you", text: "Your order leaves a European warehouse with tracking and usually arrives in 2–6 business days." },
  { icon: RotateCcw, title: "Return within 14 days", text: "Changed your mind? Request a return from your account within 14 days of delivery." },
];

const FEATURES = [
  { icon: Receipt, title: "VAT included", text: "Prices include VAT, and the right rate for your country is applied at checkout. No surprises at the end." },
  { icon: Globe, title: "No customs fees", text: "Everything ships from inside the EU, so there is nothing extra to pay when your parcel arrives." },
  { icon: Truck, title: "Tracked delivery", text: "Every parcel gets a tracking number that you can follow from your account." },
  { icon: ShieldCheck, title: "Secure payments", text: "Payments are handled by Stripe and Mollie. Your card details never touch our servers." },
  { icon: RotateCcw, title: "14-day returns", text: "You have 14 days after delivery to change your mind, as EU consumer law guarantees." },
  { icon: Lock, title: "Your data stays in the EU", text: "GDPR compliant, with your personal data hosted inside the European Union." },
];

const FAQ = [
  { q: "How long does delivery take?", a: "Most orders arrive in 2–6 business days. Products ship from warehouses inside the EU, so there are no customs fees." },
  { q: "Which countries do you deliver to?", a: "All 27 EU member states. The VAT rate of your country is applied automatically at checkout." },
  { q: "Do I need an account to order?", a: "No, you can check out as a guest. With an account your details are filled in at checkout and all your orders and tracking are in one place." },
  { q: "How can I pay?", a: "By credit or debit card, SEPA, iDEAL, Bancontact or Klarna. Payments are processed securely by Stripe and Mollie." },
  { q: "Why did my order arrive in more than one parcel?", a: "If your order includes products from different warehouses, each warehouse ships its part separately with its own tracking number." },
  { q: "Can I return a product?", a: "Yes. You have 14 days after delivery to withdraw from your purchase. Request the return from your account and you are refunded once it is approved." },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  if (OPEN_STORE_ENABLED) return <PlatformLanding />;

  const { category } = await searchParams;
  const [listings, user] = await Promise.all([
    db.storeProduct.findMany({
      where: { active: true, store: { published: true }, product: { active: true, supplier: { status: "APPROVED" } } },
      include: { store: { select: { slug: true } }, product: { include: { category: true, variants: { where: { position: { lt: 999 } } } } } },
      orderBy: [{ featured: "desc" }, { createdAt: "asc" }],
    }),
    getCurrentUser(),
  ]);

  // Several stores can list the same supplier product — show each product once
  const seen = new Set<string>();
  const products = listings.filter((sp) => {
    if (seen.has(sp.productId)) return false;
    seen.add(sp.productId);
    return true;
  });

  // Category tiles use the first (most featured) product of each category as their picture
  const byCategory = new Map<string, { slug: string; name: string; image?: string; count: number }>();
  for (const sp of products) {
    const c = sp.product.category;
    if (!c) continue;
    const entry = byCategory.get(c.slug) ?? { slug: c.slug, name: c.name, image: parseImages(sp.product.images)[0], count: 0 };
    entry.count++;
    byCategory.set(c.slug, entry);
  }
  const categories = [...byCategory.values()].sort((a, b) => a.name.localeCompare(b.name));
  const activeCategory = category ? byCategory.get(category) : undefined;
  const shown = category ? products.filter((sp) => sp.product.category?.slug === category) : products;
  const maxDiscount = Math.max(
    0,
    ...products.filter((sp) => sp.compareAtPrice && sp.compareAtPrice > sp.price).map((sp) => Math.round((1 - sp.price / sp.compareAtPrice!) * 100)),
  );

  const chip = (active: boolean) =>
    cn("rounded-full border px-3.5 py-1.5 text-sm transition", active ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white hover:border-ink-400");

  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(163,230,53,0.14),transparent_50%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">
                <Sparkles size={14} /> Shipped from European warehouses
              </span>
              <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-ink-950 sm:text-6xl">
                Great products.
                <br />
                <span className="bg-gradient-to-r from-brand-600 to-lime-500 bg-clip-text text-transparent">Fast EU delivery.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-600">
                Hand-picked products shipped from EU warehouses to all 27 EU countries. No customs fees, secure checkout and
                14 days to change your mind.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#products" className="btn btn-primary btn-lg">
                  Shop all products <ArrowRight size={18} />
                </a>
                <a href="#categories" className="btn btn-secondary btn-lg">
                  Browse categories
                </a>
              </div>
              <p className="mt-4 text-sm text-ink-500">Prices include VAT · Pay by card, SEPA, iDEAL or Klarna</p>
            </div>

            {/* Hero visual: the four most featured products */}
            <div className="relative mx-auto w-full max-w-lg">
              <div className="card overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-semibold text-ink-700">
                  <TrendingUp size={14} className="text-brand-600" /> Trending now
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  {products.slice(0, 4).map((sp) => (
                    <Link key={sp.id} href={`/s/${sp.store.slug}/products/${sp.slug}`} className="group overflow-hidden rounded-xl border border-ink-100">
                      <div className="overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={parseImages(sp.product.images)[0]}
                          alt={sp.title}
                          className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-medium">{sp.title}</p>
                        <p className="text-xs font-bold">{formatMoney(sp.price)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="card absolute -left-8 bottom-24 hidden w-64 p-4 shadow-xl sm:block">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-brand-700">
                    <Truck size={18} />
                  </span>
                  <div className="text-xs">
                    <p className="font-semibold text-ink-900">Delivered in 2–6 days</p>
                    <p className="text-ink-500">Tracked, from an EU warehouse</p>
                  </div>
                </div>
                <p className="mt-3 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px] text-ink-600">
                  No customs fees anywhere in the <b>EU</b>
                </p>
              </div>
              {maxDiscount > 0 && (
                <div className="card absolute -right-6 -top-6 hidden p-3 shadow-xl sm:block">
                  <p className="flex items-center gap-1 text-[11px] text-ink-500">
                    <Percent size={12} /> On sale now
                  </p>
                  <p className="text-lg font-bold">Up to {maxDiscount}% off</p>
                  <p className="text-[11px] font-medium text-emerald-600">On selected products</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-y border-ink-200 bg-white">
            <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 text-center sm:px-6 md:grid-cols-4">
              {[
                ["27", "EU countries we deliver to"],
                ["2–6 days", "Average delivery time"],
                [`${products.length}`, `Products in ${categories.length} categories`],
                ["14 days", "To change your mind"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-3xl font-extrabold tracking-tight text-ink-900">{v}</dt>
                  <dd className="mt-1 text-sm text-ink-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Categories */}
        {categories.length > 0 && (
          <section id="categories" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Categories</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight">Shop by category</h2>
            </div>
            <div className="mt-14 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              {categories.map((c) => (
                <Link key={c.slug} href={`/?category=${c.slug}#products`} className="group card overflow-hidden">
                  <div className="overflow-hidden bg-ink-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.image && <img src={c.image} alt="" loading="lazy" className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105" />}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold group-hover:underline">{c.name}</h3>
                    <p className="text-sm text-ink-500">
                      {c.count} {c.count === 1 ? "product" : "products"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Products */}
        <section id="products" className="scroll-mt-16 border-y border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Our products</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight">
                  {activeCategory?.name ?? "All products"}
                  <span className="ml-2 text-base font-normal text-ink-400">({shown.length})</span>
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/#products" className={chip(!category)}>
                  All
                </Link>
                {categories.map((c) => (
                  <Link key={c.slug} href={`/?category=${c.slug}#products`} className={chip(category === c.slug)}>
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-dashed border-ink-300 bg-white py-16 text-center text-ink-500">
                There are no products in this category yet.{" "}
                <Link href="/#products" className="font-semibold text-brand-700 hover:underline">
                  Show all products
                </Link>
              </div>
            ) : (
              <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
                {shown.map((sp) => {
                  const prices = sp.product.variants.map((v) => variantRetailPrice(sp.price, sp.product.costPrice, v.costPrice));
                  return (
                    <ProductCard
                      key={sp.id}
                      href={`/s/${sp.store.slug}/products/${sp.slug}`}
                      title={sp.title}
                      image={parseImages(sp.product.images)[0]}
                      price={prices.length ? Math.min(...prices) : sp.price}
                      compareAtPrice={sp.compareAtPrice}
                      hasVariants={new Set(prices).size > 1}
                      soldOut={sp.product.variants.every((v) => v.stock <= 0)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">How it works</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">From your basket to your door</h2>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card relative p-6">
                <span className="absolute right-5 top-5 text-5xl font-black text-ink-100">{i + 1}</span>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-900 text-white">
                  <s.icon size={20} />
                </span>
                <h3 className="mt-5 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-500">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why olozzo */}
        <section className="bg-ink-950 py-24 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Why olozzo</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight">Shopping across Europe, without the surprises.</h2>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-ink-950 p-7">
                  <f.icon className="text-brand-400" size={22} />
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-ink-400">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-b border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">Frequently asked questions</h2>
            <div className="mt-10 divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white">
              {FAQ.map((item) => (
                <details key={item.q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                    {item.q}
                    <span className="text-ink-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-ink-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-brand-600 px-8 py-16 text-center text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_40%)]" />
            <div className="relative">
              <ShoppingBag className="mx-auto" size={32} />
              <h2 className="mt-4 text-4xl font-bold tracking-tight">Track every order in one place</h2>
              <p className="mx-auto mt-4 max-w-xl text-brand-50">
                Follow your deliveries, see your order history and request returns from your olozzo account.
              </p>
              <Link href={user ? "/account" : "/register"} className="btn btn-lg mt-8 bg-white text-brand-700 hover:bg-brand-50">
                {user ? "View my orders" : "Create a free account"} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
