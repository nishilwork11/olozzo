"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";

export type MenuSubcategory = {
  slug: string;
  /** Name shortened under its parent, e.g. "Dresses" under "Women's Clothing" */
  label: string;
  image: string | null;
};

export type MenuCategory = {
  slug: string;
  name: string;
  icon: string | null;
  productCount: number;
  children: MenuSubcategory[];
};

type Timer = "open" | "close" | "switch";

const OPEN_DELAY = 150; // hover intent before the menu opens
const CLOSE_DELAY = 250; // grace period to move the pointer from the button into the panel
const SWITCH_DELAY = 90; // resting time on a category before its subcategories show (diagonal moves don't flip them)

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

/** Top-level category the current /c/<slug> page belongs to, or -1. */
function categoryIndexFor(categories: MenuCategory[], pathname: string): number {
  if (!pathname.startsWith("/c/")) return -1;
  let slug: string;
  try {
    slug = decodeURIComponent(pathname.slice(3).split("/")[0] ?? "");
  } catch {
    return -1; // malformed escape in the URL
  }
  return categories.findIndex((c) => c.slug === slug || c.children.some((s) => s.slug === slug));
}

/**
 * "All categories" mega menu (desktop): every top-level category on the left; the one under the pointer
 * or keyboard focus shows its subcategories as picture tiles on the right.
 */
export function CategoryMenu({ categories }: { categories: MenuCategory[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // opened by click or keyboard: stays open when the pointer leaves
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const detailRef = useRef<HTMLDivElement>(null);
  const timers = useRef<Partial<Record<Timer, number>>>({});
  const previewTap = useRef(-1); // touch: the first tap on a category previews it instead of navigating
  const panelId = useId();

  const clearTimers = useCallback((...keys: Timer[]) => {
    for (const key of keys) {
      window.clearTimeout(timers.current[key]);
      delete timers.current[key];
    }
  }, []);

  const close = useCallback(
    (restoreFocus = false) => {
      clearTimers("open", "close", "switch");
      setOpen(false);
      setPinned(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [clearTimers],
  );

  /** Opens the menu (on the current page's category) and returns the highlighted index. */
  function openMenu(pin: boolean): number {
    clearTimers("open", "close");
    let index = active;
    if (!open) {
      const current = categoryIndexFor(categories, pathname);
      if (current >= 0) index = current;
      setActive(index);
      setOpen(true);
    }
    if (pin) setPinned(true);
    return index;
  }

  // Close on navigation
  useEffect(() => close(), [pathname, close]);

  // Escape and clicks outside close it
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(rootRef.current?.contains(document.activeElement) ?? false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  useEffect(() => () => clearTimers("open", "close", "switch"), [clearTimers]);

  if (categories.length === 0) return null;
  const current = categories[active] ?? categories[0];

  function focusItem(index: number) {
    setActive(index);
    itemRefs.current[index]?.focus();
  }

  function onItemKeyDown(e: React.KeyboardEvent, index: number) {
    const last = categories.length - 1;
    const moves: Partial<Record<string, number>> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = moves[e.key];
    if (next !== undefined) {
      e.preventDefault();
      focusItem(next);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      detailRef.current?.querySelector<HTMLElement>("a")?.focus();
    }
  }

  return (
    <div
      ref={rootRef}
      className="shrink-0"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimers("close");
        if (!open && timers.current.open === undefined) {
          timers.current.open = window.setTimeout(() => {
            delete timers.current.open;
            openMenu(false);
          }, OPEN_DELAY);
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimers("open", "switch");
        if (open && !pinned) timers.current.close = window.setTimeout(() => close(), CLOSE_DELAY);
      }}
      onBlur={(e) => {
        // Tabbing out of the menu closes it
        const next = e.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) openMenu(true);
          else if (!pinned) {
            clearTimers("close");
            setPinned(true); // opened by hovering: a click keeps it open
          } else close();
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown") return;
          e.preventDefault();
          const index = openMenu(true);
          requestAnimationFrame(() => itemRefs.current[index]?.focus());
        }}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full bg-brand-600 pl-3.5 pr-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:ring-offset-2",
          FOCUS_RING,
        )}
      >
        <LayoutGrid size={17} aria-hidden="true" />
        All categories
        <ChevronDown size={16} aria-hidden="true" className={cn("motion-safe:transition-transform", open && "rotate-180")} />
      </button>

      {/* Positioned against the full-width category row; only the card itself takes the pointer */}
      <div id={panelId} hidden={!open} className="pointer-events-none absolute inset-x-0 top-full z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="pointer-events-auto flex h-[min(540px,calc(100vh_-_170px))] overflow-hidden rounded-b-2xl border border-t-0 border-ink-200 bg-white shadow-2xl shadow-ink-900/15">
            <ul aria-label="Categories" className="w-64 shrink-0 overflow-y-auto overscroll-contain border-r border-ink-100 py-2">
              {categories.map((c, i) => (
                <li key={c.slug}>
                  <Link
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    href={`/c/${c.slug}`}
                    tabIndex={i === active ? 0 : -1}
                    onFocus={() => setActive(i)}
                    onKeyDown={(e) => onItemKeyDown(e, i)}
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return;
                      clearTimers("switch");
                      timers.current.switch = window.setTimeout(() => setActive(i), SWITCH_DELAY);
                    }}
                    onPointerLeave={() => clearTimers("switch")}
                    onPointerDown={(e) => {
                      previewTap.current = e.pointerType !== "mouse" && i !== active ? i : -1;
                    }}
                    onClick={(e) => {
                      if (previewTap.current === i) {
                        e.preventDefault();
                        previewTap.current = -1;
                        setActive(i);
                      } else close();
                    }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-sm focus-visible:ring-inset",
                      FOCUS_RING,
                      i === active ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-700 hover:bg-ink-50",
                    )}
                  >
                    <CategoryIcon icon={c.icon} size={18} className={cn("shrink-0", i === active ? "text-brand-600" : "text-ink-400")} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {i === active && <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-brand-600" />}
                  </Link>
                </li>
              ))}
            </ul>

            <div
              ref={detailRef}
              className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-6"
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft") return;
                e.preventDefault();
                itemRefs.current[active]?.focus();
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-lg font-bold tracking-tight text-ink-900">{current.name}</p>
                <Link
                  href={`/c/${current.slug}`}
                  onClick={() => close()}
                  className={cn("inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline", FOCUS_RING)}
                >
                  See all {current.name}
                  {current.productCount > 0 && ` (${current.productCount})`}
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </div>
              {current.children.length > 0 ? (
                <ul className="mt-5 grid grid-cols-5 gap-x-3 gap-y-5 xl:grid-cols-6">
                  {current.children.map((sub) => (
                    <li key={sub.slug}>
                      <Link
                        href={`/c/${sub.slug}`}
                        onClick={() => close()}
                        className={cn("group flex flex-col items-center gap-2 rounded-xl p-1.5 text-center", FOCUS_RING)}
                      >
                        <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full bg-brand-50 ring-1 ring-brand-100 transition group-hover:ring-2 group-hover:ring-brand-500 xl:h-20 xl:w-20">
                          {sub.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={sub.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          ) : (
                            <CategoryIcon icon={current.icon} size={28} className="text-brand-600" />
                          )}
                        </span>
                        <span className="line-clamp-2 text-xs font-medium leading-snug text-ink-700 group-hover:text-brand-700">{sub.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-ink-500">Browse everything in {current.name}.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One horizontally scrolling row (category quick links). Swipe on touch screens; with a mouse,
 * arrow buttons appear at an edge that has more to show. Keyboard users simply Tab along the links.
 */
export function ScrollRow({ children, className, innerClassName }: { children: React.ReactNode; className?: string; innerClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ back: false, forward: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const back = el.scrollLeft > 4;
      const forward = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((prev) => (prev.back === back && prev.forward === forward ? prev : { back, forward }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function scroll(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: smooth ? "smooth" : "auto" });
  }

  const arrow = "pointer-events-auto hidden h-7 w-7 place-items-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-sm hover:text-ink-900 lg:grid";
  return (
    <div className={cn("relative min-w-0", className)}>
      <div ref={ref} className={cn("flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", innerClassName)}>
        {children}
      </div>
      {edges.back && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-white via-white/90 to-transparent pr-8">
          <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => scroll(-1)} className={arrow}>
            <ChevronLeft size={16} />
          </button>
        </div>
      )}
      {edges.forward && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-white via-white/90 to-transparent pl-8">
          <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => scroll(1)} className={arrow}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
