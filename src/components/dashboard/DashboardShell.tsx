import { LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { NavLink } from "@/components/client";
import { Logo } from "@/components/ui";
import type { CurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export function DashboardShell({
  user,
  area,
  nav,
  footer,
  children,
}: {
  user: CurrentUser;
  area: string;
  nav: NavItem[];
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink-50/70 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="px-5 pb-4 pt-5">
          <Logo />
          <p className="mt-3 inline-flex rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{area}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              exact={item.exact}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition"
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        {footer && <div className="px-3 pb-2">{footer}</div>}
        <div className="border-t border-ink-100 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-ink-500">{ROLE_LABELS[user.role]}</p>
            </div>
            <form action={logoutAction}>
              <button className="grid h-8 w-8 place-items-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900" title="Log out" aria-label="Log out">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Logo />
            <form action={logoutAction}>
              <button className="btn btn-ghost btn-sm">
                <LogOut size={14} /> Log out
              </button>
            </form>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {nav.map((item) => (
              <NavLink key={item.href} href={item.href} exact={item.exact} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium">
                <item.icon size={14} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
