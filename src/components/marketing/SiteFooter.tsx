import Link from "next/link";
import { Logo } from "@/components/ui";

const COLUMNS = [
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
  {
    title: "Legal",
    links: [
      { href: "/legal/imprint", label: "Imprint" },
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/withdrawal", label: "Right of withdrawal" },
      { href: "/legal/cookies", label: "Cookie Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-200 bg-ink-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-ink-500">
            The dropshipping commerce platform built for Europe. Launch, sell and scale across all 27 EU markets
            without holding inventory.
          </p>
          <p className="mt-4 text-xs text-ink-400">Prices in EUR incl. VAT · GDPR compliant · EU data hosting</p>
        </div>
        {COLUMNS.map((col) => (
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
