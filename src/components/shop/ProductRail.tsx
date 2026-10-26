"use client";

import { Children, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontally scrolling list: swipe on touch screens, arrow buttons on larger screens once the content
 * overflows. Children must be <li> elements. Server-rendered children stay server components.
 */
export function RailScroller({
  label,
  children,
  className,
  arrowClassName = "top-1/2",
  revealCurrent = false,
}: {
  /** Accessible name of the list */
  label: string;
  children: React.ReactNode;
  /** Layout of the list itself (flex or grid, gaps, padding) */
  className?: string;
  /** Vertical position of the arrow buttons */
  arrowClassName?: string;
  /** On load, scroll the item marked aria-current into view (e.g. the selected category chip) */
  revealCurrent?: boolean;
}) {
  const listId = useId();
  const ref = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const back = el.scrollLeft > 4;
    const forward = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setCanScroll((prev) => (prev.back === back && prev.forward === forward ? prev : { back, forward }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !revealCurrent) return;
    const current = el.querySelector<HTMLElement>("[aria-current]");
    if (!current) return;
    const list = el.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.left < list.left || item.right > list.right) el.scrollLeft += item.left - list.left - (list.width - item.width) / 2;
  }, [revealCurrent, children]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update]);

  const scroll = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 160), behavior: reduceMotion ? "auto" : "smooth" });
  };

  const arrow = (direction: 1 | -1) => (
    <button
      type="button"
      onClick={() => scroll(direction)}
      aria-controls={listId}
      aria-label={direction === 1 ? `Scroll ${label} forward` : `Scroll ${label} back`}
      className={cn(
        "absolute z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-white/95 text-ink-700 shadow-md transition hover:bg-white hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:grid",
        direction === 1 ? "right-0 translate-x-1/3" : "left-0 -translate-x-1/3",
        arrowClassName,
      )}
    >
      {direction === 1 ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
    </button>
  );

  return (
    <div className="relative">
      <ul
        id={listId}
        ref={ref}
        aria-label={label}
        // `relative` keeps absolutely positioned descendants (e.g. sr-only text) inside the scroll area
        className={cn("relative overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
      >
        {children}
      </ul>
      {canScroll.back && arrow(-1)}
      {canScroll.forward && arrow(1)}
    </div>
  );
}

/** A row of product cards that scrolls sideways (about six cards visible on desktop). */
export function ProductRail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const items = Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <RailScroller
      label={label}
      // padding (offset by the negative margin) keeps the cards' focus rings inside the scroll area
      className={cn("-m-1 flex snap-x gap-3 p-1", className)}
      arrowClassName="top-[72px] sm:top-[84px] lg:top-[100px]"
    >
      {items.map((child, i) => (
        <li key={isValidElement(child) && child.key != null ? child.key : i} className="w-[8.5rem] shrink-0 snap-start sm:w-40 lg:w-48">
          {child}
        </li>
      ))}
    </RailScroller>
  );
}
