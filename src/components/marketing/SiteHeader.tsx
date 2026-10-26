import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/rbac";
import { Logo } from "@/components/ui";
import { OPEN_STORE_ENABLED } from "@/lib/features";

const NAV = OPEN_STORE_ENABLED
  ? [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#features", label: "Features" },
      { href: "/#suppliers", label: "Suppliers" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/explore", label: "Explore stores" },
    ]
  : [
      { href: "/#categories", label: "Categories" },
      { href: "/#products", label: "All products" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#faq", label: "FAQ" },
    ];

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-ink-600 md:flex">
            {NAV.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-ink-900">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href={homeForRole(user.role)} className="btn btn-dark">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary">
                {OPEN_STORE_ENABLED ? "Start free trial" : "Create account"}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
