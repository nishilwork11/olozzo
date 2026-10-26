import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  CreditCard,
  Globe,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { parseImages } from "@/lib/utils";

const STEPS = [
  { icon: Store, title: "Launch your store", text: "Pick a name and brand colour. Your storefront is live in under a minute — no code, no theme hunting." },
  { icon: Boxes, title: "Import products", text: "Browse thousands of products from verified EU suppliers. One click imports photos, variants and pricing." },
  { icon: CreditCard, title: "Sell & get paid", text: "Customers pay with cards, SEPA, iDEAL, Bancontact or Klarna. VAT is calculated per country automatically." },
  { icon: Truck, title: "Supplier ships it", text: "Paid orders are routed to the right supplier, who ships straight to your customer with tracking." },
];

const FEATURES = [
  { icon: Boxes, title: "Supplier marketplace", text: "Curated EU wholesalers with real stock levels, shipping times and ships-from country on every product." },
  { icon: Zap, title: "Automatic order routing", text: "Multi-supplier orders are split and forwarded instantly — no copy-pasting addresses into supplier portals." },
  { icon: Receipt, title: "EU VAT & OSS ready", text: "Destination-country VAT for all 27 member states, VAT-inclusive pricing and clear invoices." },
  { icon: CreditCard, title: "Stripe & Mollie built in", text: "Accept every popular European payment method with refunds handled from your dashboard." },
  { icon: ShieldCheck, title: "Role-based access", text: "Admins, merchants, suppliers and customers each get their own secure workspace and permissions." },
  { icon: TrendingUp, title: "Profit analytics", text: "See revenue, supplier cost, fees and true profit per order — not just top-line sales." },
  { icon: Percent, title: "Discount codes", text: "Percentage or fixed-amount codes with minimum spend, usage limits and expiry dates." },
  { icon: RotateCcw, title: "14-day returns flow", text: "Customers request returns online; you approve and refund in one click — compliant with EU withdrawal rights." },
  { icon: Globe, title: "Your own subdomain", text: "Every store gets its own address like yourbrand.olozzo.com, ready for a custom domain on Pro." },
];

const FAQ = [
  { q: "Do I need to buy inventory?", a: "No. You only pay the supplier's wholesale price after your customer has paid you. Suppliers ship directly to the customer." },
  { q: "Which countries can I sell to?", a: "All 27 EU member states out of the box, with the correct VAT rate applied automatically for each destination country." },
  { q: "How do I get paid?", a: "Connect Stripe and/or Mollie. Payments land in your own account; supplier costs and the olozzo transaction fee are shown per order." },
  { q: "How fast is shipping?", a: "Our suppliers hold stock in EU warehouses, so most products arrive in 2–6 business days — no customs fees for your customers." },
  { q: "Can I become a supplier?", a: "Yes. Apply as a supplier, list your wholesale catalog, and once approved thousands of merchants can import and sell your products." },
];

// The "open your store" landing page for merchants and suppliers. Shown on / when OPEN_STORE_ENABLED is on.
export async function PlatformLanding() {
  const [trending, stats] = await Promise.all([
    db.storeProduct.findMany({
      where: { active: true, featured: true, store: { published: true }, product: { active: true } },
      include: { product: true, store: true },
      take: 8,
      orderBy: { createdAt: "asc" },
    }),
    Promise.all([db.store.count({ where: { published: true } }), db.supplier.count({ where: { status: "APPROVED" } }), db.product.count({ where: { active: true } })]),
  ]);
  const [storeCount, supplierCount, productCount] = stats;

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
                <Sparkles size={14} /> The dropshipping platform made for Europe
              </span>
              <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-ink-950 sm:text-6xl">
                Start your online store.
                <br />
                <span className="bg-gradient-to-r from-brand-600 to-lime-500 bg-clip-text text-transparent">Skip the inventory.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-600">
                olozzo gives you a beautiful storefront, a marketplace of verified EU suppliers and automated order
                fulfilment — so you can sell to all 27 EU countries without ever touching a parcel.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="btn btn-primary btn-lg">
                  Start 14-day free trial <ArrowRight size={18} />
                </Link>
                <Link href="/explore" className="btn btn-secondary btn-lg">
                  See live stores
                </Link>
              </div>
              <p className="mt-4 text-sm text-ink-500">No credit card required · Cancel any time</p>
            </div>

            {/* Hero visual */}
            <div className="relative mx-auto w-full max-w-lg">
              <div className="card overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="ml-3 rounded bg-white px-2 py-0.5 font-mono text-[11px] text-ink-500">urban-nest.olozzo.com</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  {trending.slice(0, 4).map((sp) => (
                    <div key={sp.id} className="overflow-hidden rounded-xl border border-ink-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={parseImages(sp.product.images)[0]} alt={sp.title} className="aspect-square w-full object-cover" />
                      <div className="p-2.5">
                        <p className="truncate text-xs font-medium">{sp.title}</p>
                        <p className="text-xs font-bold">{formatMoney(sp.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card absolute -left-8 bottom-10 hidden w-64 p-4 shadow-xl sm:block">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-brand-700">
                    <Package size={18} />
                  </span>
                  <div className="text-xs">
                    <p className="font-semibold text-ink-900">New order · Amsterdam</p>
                    <p className="text-ink-500">€89.99 · profit €38.42</p>
                  </div>
                </div>
                <p className="mt-3 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px] text-ink-600">
                  → Routed to <b>Berlin Gadget Wholesale</b>
                </p>
              </div>
              <div className="card absolute -right-6 -top-6 hidden p-3 shadow-xl sm:block">
                <p className="text-[11px] text-ink-500">Today&apos;s revenue</p>
                <p className="text-lg font-bold">€2,481.60</p>
                <p className="text-[11px] font-medium text-emerald-600">▲ 18% vs yesterday</p>
              </div>
            </div>
          </div>

          <div className="border-y border-ink-200 bg-white">
            <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 text-center sm:px-6 md:grid-cols-4">
              {[
                ["27", "EU countries served"],
                ["2–6 days", "Average delivery time"],
                [`${productCount}+`, `Products from ${supplierCount} verified suppliers`],
                [`${storeCount}`, "Stores live on olozzo"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-3xl font-extrabold tracking-tight text-ink-900">{v}</dt>
                  <dd className="mt-1 text-sm text-ink-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">How it works</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">From idea to first sale in an afternoon</h2>
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

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-ink-950 py-24 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Everything included</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight">All the tools of a commerce platform. Built around dropshipping.</h2>
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

        {/* Trending */}
        {trending.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Live on olozzo</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight">Trending in our merchants&apos; stores</h2>
              </div>
              <Link href="/explore" className="hidden text-sm font-semibold text-brand-700 hover:underline sm:block">
                Explore all stores →
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4">
              {trending.map((sp) => (
                <Link key={sp.id} href={`/s/${sp.store.slug}/products/${sp.slug}`} className="group">
                  <div className="overflow-hidden rounded-2xl bg-ink-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={parseImages(sp.product.images)[0]}
                      alt={sp.title}
                      className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-3 text-xs text-ink-500">{sp.store.name}</p>
                  <p className="font-medium leading-snug">{sp.title}</p>
                  <p className="mt-1 font-semibold">{formatMoney(sp.price)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Suppliers */}
        <section id="suppliers" className="scroll-mt-20 border-y border-ink-200 bg-ink-50">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">For suppliers & wholesalers</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight">Put your catalog in front of thousands of European sellers</h2>
              <p className="mt-5 text-lg text-ink-600">
                List your products once. Merchants import them into their stores and you receive ready-to-ship orders with
                the customer&apos;s address — paid, routed and tracked through olozzo.
              </p>
              <ul className="mt-8 space-y-3">
                {["Zero listing fees — you set the wholesale price", "Orders arrive pre-paid with full shipping details", "Bulk CSV upload and stock management", "Blind shipping: parcels go out under the merchant's brand"].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-ink-700">
                    <BadgeCheck className="shrink-0 text-brand-600" size={20} /> {t}
                  </li>
                ))}
              </ul>
              <Link href="/register?role=supplier" className="btn btn-dark btn-lg mt-8">
                Apply as a supplier <ArrowRight size={18} />
              </Link>
            </div>
            <div className="card p-6">
              <p className="text-sm font-semibold text-ink-500">Fulfilment queue</p>
              <div className="mt-4 space-y-3">
                {[
                  { n: "OLZ-7K2M9QXA", c: "Lyon, FR", s: "Ship now", tone: "bg-amber-50 text-amber-700" },
                  { n: "OLZ-P4T8WN2C", c: "Madrid, ES", s: "Shipped · DHL", tone: "bg-indigo-50 text-indigo-700" },
                  { n: "OLZ-B3HZ6RLE", c: "Dublin, IE", s: "Delivered", tone: "bg-emerald-50 text-emerald-700" },
                ].map((o) => (
                  <div key={o.n} className="flex items-center justify-between rounded-xl border border-ink-100 px-4 py-3">
                    <div>
                      <p className="font-mono text-sm font-semibold">{o.n}</p>
                      <p className="text-xs text-ink-500">{o.c}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${o.tone}`}>{o.s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Pricing</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">Simple plans. Pay as you grow.</h2>
            <p className="mt-4 text-ink-500">All prices in EUR excl. VAT. 14-day free trial on every plan.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {Object.values(PLANS).map((plan) => {
              const highlight = plan.id === "GROWTH";
              return (
                <div key={plan.id} className={`card relative p-8 ${highlight ? "border-brand-600 ring-2 ring-brand-600" : ""}`}>
                  {highlight && (
                    <span className="absolute -top-3 left-8 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-sm text-ink-500">{plan.blurb}</p>
                  <p className="mt-6">
                    <span className="text-4xl font-extrabold">{formatMoney(plan.monthly).replace(".00", "")}</span>
                    <span className="text-ink-500">/month</span>
                  </p>
                  <ul className="mt-6 space-y-3 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check size={16} className="mt-0.5 shrink-0 text-brand-600" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className={`btn btn-lg mt-8 w-full ${highlight ? "btn-primary" : "btn-secondary"}`}>
                    Start free trial
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-ink-200 bg-ink-50">
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
              <Users className="mx-auto" size={32} />
              <h2 className="mt-4 text-4xl font-bold tracking-tight">Your European store is one click away</h2>
              <p className="mx-auto mt-4 max-w-xl text-brand-50">Join merchants and suppliers building the next generation of European brands.</p>
              <Link href="/register" className="btn btn-lg mt-8 bg-white text-brand-700 hover:bg-brand-50">
                Create your store <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
