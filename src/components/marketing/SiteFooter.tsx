import Link from "next/link";
import { Receipt, ShieldCheck, Warehouse } from "lucide-react";
import { getHouseStoreInfo } from "@/components/shop/PromoBar";
import { Logo } from "@/components/ui";
import { DEALS_HREF, ORDERS_HREF } from "./SiteHeader";
import { getCategoryTree } from "@/lib/catalog";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { formatMoney } from "@/lib/money";

type FooterLink = { href: string; label: string };

const LEGAL: FooterLink[] = [
  { href: "/legal/imprint", label: "Imprint" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/withdrawal", label: "Right of withdrawal" },
  { href: "/legal/cookies", label: "Cookie Policy" },
];

const PAYMENT_METHODS = ["Visa", "Mastercard", "SEPA", "iDEAL", "Bancontact", "Klarna"];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href + l.label}>
            {l.href.startsWith("mailto:") ? (
              <a href={l.href} className="rounded transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="rounded transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shop footer (Temu/DHgate style): about, customer service, help, top categories, legal, payment methods. */
export async function SiteFooter() {
  if (OPEN_STORE_ENABLED) return <PlatformFooter />;

  const [tree, house] = await Promise.all([getCategoryTree(), getHouseStoreInfo()]);
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "Customer service",
      links: [
        { href: "/#faq", label: "Shipping information" },
        { href: "/legal/withdrawal", label: "14-day returns" },
        { href: ORDERS_HREF, label: "Track your order" },
      ],
    },
    {
      title: "Help",
      links: [
        { href: "/#faq", label: "FAQ" },
        // The house store's support address once it has one; the imprint always lists a contact address
        house?.supportEmail ? { href: `mailto:${house.supportEmail}`, label: "Contact us" } : { href: "/legal/imprint", label: "Contact us" },
        { href: "/account", label: "My account" },
      ],
    },
    ...(tree.length > 0 ? [{ title: "Shop", links: tree.slice(0, 8).map((c) => ({ href: `/c/${c.slug}`, label: c.name })) }] : []),
    { title: "Legal", links: LEGAL },
  ];

  return (
    <footer className="bg-ink-950 text-ink-300">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <h2 className="sr-only">About olozzo</h2>
            <Logo light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">
              Everyday products — fashion, home, electronics and more — shipped from European warehouses to all 27 EU
              countries.
            </p>
            {house?.freeShippingOver != null && (
              <p className="mt-3 text-sm">Free shipping on orders over {formatMoney(house.freeShippingOver).replace(/\.00$/, "")}.</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={DEALS_HREF}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-brand-400 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Today&apos;s deals
              </Link>
              <Link
                href="/games"
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-brand-400 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Play our games
              </Link>
            </div>
          </div>
          {columns.map((col) => (
            <FooterColumn key={col.title} {...col} />
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-6 border-t border-white/10 pt-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-400">We accept</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <li key={m} className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white">
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <ul className="flex flex-col gap-2.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li className="flex items-center gap-2">
              <Receipt size={16} aria-hidden="true" className="shrink-0 text-brand-400" /> Prices in EUR incl. VAT
            </li>
            <li className="flex items-center gap-2">
              <Warehouse size={16} aria-hidden="true" className="shrink-0 text-brand-400" /> Ships from EU warehouses
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={16} aria-hidden="true" className="shrink-0 text-brand-400" /> GDPR compliant
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} olozzo. All rights reserved.
      </div>
    </footer>
  );
}

// ── Platform mode (OPEN_STORE_ENABLED): the marketing footer for merchants and suppliers ──

const PLATFORM_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Platform",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/explore", label: "Explore stores" },
      { href: "/register", label: "Start selling" },
    ],
  },
  {
    title: "Partners",
    links: [
      { href: "/register?role=supplier", label: "Become a supplier" },
      { href: "/#suppliers", label: "Supplier network" },
      { href: "/login", label: "Supplier login" },
    ],
  },
  { title: "Legal", links: LEGAL },
];

function PlatformFooter() {
  return (
    <footer className="border-t border-ink-200 bg-ink-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-ink-500">
            The dropshipping commerce platform built for Europe. Launch, sell and scale across all 27 EU markets without holding
            inventory.
          </p>
          <p className="mt-4 text-xs text-ink-400">Prices in EUR incl. VAT · GDPR compliant</p>
        </div>
        {PLATFORM_COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-ink-900">{col.title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ink-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-200 py-5 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} olozzo. All rights reserved.
      </div>
    </footer>
  );
}
