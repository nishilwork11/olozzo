import { ShieldCheck, ShoppingBag } from "lucide-react";
import { NavLink } from "@/components/client";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { requireUser } from "@/lib/auth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <SiteHeader />
      <div className="mx-auto min-h-[60vh] max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">My account</h1>
        <p className="mt-1 text-ink-500">
          {user.name} · {user.email}
        </p>
        <nav className="mt-6 flex gap-1 border-b border-ink-200">
          {[
            { href: "/account", label: "Orders", icon: ShoppingBag, exact: true },
            { href: "/account/settings", label: "Profile & privacy", icon: ShieldCheck, exact: false },
          ].map((t) => (
            <NavLink
              key={t.href}
              href={t.href}
              exact={t.exact}
              className="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium"
              activeClassName="border-ink-900 text-ink-900"
              inactiveClassName="border-transparent text-ink-500 hover:text-ink-800"
            >
              <t.icon size={16} /> {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="pt-8">{children}</div>
      </div>
      <SiteFooter />
    </>
  );
}
