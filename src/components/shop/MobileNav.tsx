"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgePercent, ChevronDown, ChevronRight, CircleHelp, Flame, Gamepad2, LogOut, Menu, Package, ShoppingCart, User, X } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MenuCategory } from "./CategoryMenu";
import { CategoryIcon } from "./CategoryIcon";
import { SearchBar } from "./SearchBar";

const OPEN_EVENT = "olozzo:open-mobile-nav";
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type MobileNavAccount = {
  name: string;
  href: string;
  label: string;
  /** Separate orders link, when the account home is not already the order list */
  ordersHref: string | null;
} | null;

type MobileNavProps = {
  categories: MenuCategory[];
  account: MobileNavAccount;
  cartHref: string;
  dealsHref: string;
};

/** Opens the mobile menu at its category list (for buttons elsewhere on the page). */
export function MobileCategoriesButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: "categories" }))}
      className={className}
    >
      {children}
    </button>
  );
}

/** Menu button (below lg) and its slide-in drawer: search, account, shortcuts and every category. */
export function MobileNav({ categories, account, cartHref, dealsHref }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // in the DOM (stays during the slide-out)
  const [visible, setVisible] = useState(false); // slid in
  const [expanded, setExpanded] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const categoriesRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const atCategories = useRef(false);
  const id = useId();
  const panelId = `${id}-menu`;

  const show = useCallback((section?: string) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    atCategories.current = section === "categories";
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Mount, then slide in on the next frame; slide out, then unmount
  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), 250);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Focus moves into the drawer when it opens and back to what opened it when it closes
  useEffect(() => {
    if (!open || !mounted) return;
    closeRef.current?.focus({ preventScroll: true });
    if (atCategories.current) categoriesRef.current?.scrollIntoView({ block: "start" });
    return () => {
      const target = returnFocus.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  // Lock the page behind it; Escape or growing to the desktop layout closes it
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "Tab" && !panelRef.current?.contains(document.activeElement)) {
        // Focus fell out of the drawer (e.g. onto the page body): bring it back instead of tabbing behind it
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (desktop.matches) close();
    };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onResize);
    return () => {
      body.style.overflow = before.overflow;
      body.style.paddingRight = before.paddingRight;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
    };
  }, [open, close]);

  // Close on navigation
  useEffect(() => close(), [pathname, close]);

  // "All categories" buttons elsewhere open it too
  useEffect(() => {
    const onOpen = (e: Event) => show((e as CustomEvent<unknown>).detail === "categories" ? "categories" : undefined);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [show]);

  // Keep Tab inside the drawer while it is open
  function trapFocus(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const row = cn("flex items-center gap-3 px-4 py-3 text-sm font-medium text-ink-800 hover:bg-ink-50 focus-visible:ring-inset", FOCUS_RING);

  const drawer = (
    <div className="fixed inset-0 z-[60] lg:hidden">
      <div
        aria-hidden="true"
        onClick={close}
        className={cn("absolute inset-0 bg-ink-950/50 motion-safe:transition-opacity motion-safe:duration-200", visible ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onKeyDown={trapFocus}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) close();
        }}
        className={cn(
          "absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-white shadow-2xl motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
          visible ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-100 pl-4 pr-2">
          <Logo />
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close menu"
            className={cn("grid h-10 w-10 place-items-center rounded-full text-ink-600 hover:bg-ink-100 hover:text-ink-900", FOCUS_RING)}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-8">
          <div className="p-4">
            <SearchBar onSubmitted={close} />
          </div>

          {account ? (
            <div className="mx-4 rounded-2xl bg-brand-50 p-4">
              <p className="text-sm text-ink-600">
                Hi, <span className="font-semibold text-ink-900">{account.name}</span>
              </p>
              <div className={cn("mt-3 grid gap-2", account.ordersHref && "grid-cols-2")}>
                <Link href={account.href} className="btn btn-secondary btn-sm">
                  <User size={15} aria-hidden="true" /> {account.label}
                </Link>
                {account.ordersHref && (
                  <Link href={account.ordersHref} className="btn btn-secondary btn-sm">
                    <Package size={15} aria-hidden="true" /> Orders
                  </Link>
                )}
              </div>
              <form action={logoutAction} className="mt-2">
                <button type="submit" className="btn btn-ghost btn-sm w-full">
                  <LogOut size={15} aria-hidden="true" /> Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="mx-4 grid grid-cols-2 gap-2">
              <Link href="/login" className="btn btn-primary">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-secondary">
                Create account
              </Link>
            </div>
          )}

          <ul className="mt-4 border-y border-ink-100 py-1">
            {[
              { href: dealsHref, label: "Deals", icon: BadgePercent },
              { href: "/trending", label: "Trending now", icon: Flame },
              { href: "/games", label: "Games", icon: Gamepad2 },
              { href: cartHref, label: "Cart", icon: ShoppingCart },
              { href: "/#faq", label: "Help & FAQ", icon: CircleHelp },
            ].map((l) => (
              <li key={l.label}>
                <Link href={l.href} className={row}>
                  <l.icon size={20} aria-hidden="true" className="text-brand-600" />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          {categories.length > 0 && (
            <section ref={categoriesRef} aria-labelledby={`${id}-categories`} className="scroll-mt-2 pt-5">
              <h2 id={`${id}-categories`} className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
                Categories
              </h2>
              <ul className="divide-y divide-ink-100 border-y border-ink-100">
                {categories.map((c) => {
                  const isOpen = expanded === c.slug;
                  const listId = `${id}-${c.slug}`;
                  return (
                    <li key={c.slug}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={listId}
                        onClick={() => setExpanded(isOpen ? null : c.slug)}
                        className={cn(row, "w-full text-left")}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                          <CategoryIcon icon={c.icon} size={18} />
                        </span>
                        <span className="min-w-0 flex-1">{c.name}</span>
                        <ChevronDown size={18} aria-hidden="true" className={cn("shrink-0 text-ink-400 motion-safe:transition-transform", isOpen && "rotate-180")} />
                      </button>
                      <div id={listId} hidden={!isOpen} className="bg-ink-50 px-4 pb-5 pt-2">
                        <Link
                          href={`/c/${c.slug}`}
                          className={cn("inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:underline", FOCUS_RING)}
                        >
                          See all {c.name}
                          {c.productCount > 0 && ` (${c.productCount})`}
                          <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                        {c.children.length > 0 && (
                          <ul className="mt-4 grid grid-cols-3 gap-x-2 gap-y-4">
                            {c.children.map((s) => (
                              <li key={s.slug}>
                                <Link href={`/c/${s.slug}`} className={cn("flex flex-col items-center gap-1.5 rounded-lg p-1 text-center", FOCUS_RING)}>
                                  <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-ink-200">
                                    {s.image ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={s.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                    ) : (
                                      <CategoryIcon icon={c.icon} size={22} className="text-brand-600" />
                                    )}
                                  </span>
                                  <span className="line-clamp-2 text-xs leading-tight text-ink-700">{s.label}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => show()}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={mounted ? panelId : undefined}
        className={cn("-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-700 hover:bg-ink-100 lg:hidden", FOCUS_RING)}
      >
        <Menu size={24} aria-hidden="true" />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
