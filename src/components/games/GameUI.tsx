"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

// Small building blocks shared by the mini games.

export function Stats({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid gap-2", className)}>{children}</dl>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-xl bg-brand-50 px-1.5 py-2 text-center ring-1 ring-inset ring-brand-100 sm:px-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-brand-700">{label}</dt>
      <dd className="relative mt-0.5 whitespace-nowrap text-lg font-extrabold leading-tight tabular-nums text-ink-900 sm:text-xl">{value}</dd>
      {hint && <dd className="truncate text-[11px] font-medium tabular-nums text-ink-500">{hint}</dd>}
    </div>
  );
}

/** Screen-reader announcements for moves, scores and game over. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

/**
 * A panel laid over the board (start, pause, win, game over). Its first button gets focus when it opens,
 * unless `autoFocus` is false (the start screen, so loading the page doesn't move focus).
 */
export function Overlay({
  title,
  children,
  actions,
  autoFocus = true,
  tone = "light",
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  actions: React.ReactNode;
  autoFocus?: boolean;
  tone?: "light" | "brand";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (autoFocus) ref.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      className="absolute inset-0 z-30 grid place-items-center rounded-2xl bg-ink-950/15 p-3 text-center sm:p-4"
    >
      <div
        className={cn(
          "w-full max-w-[19rem] rounded-2xl px-4 py-5 shadow-xl ring-1 sm:px-6",
          tone === "brand" ? "bg-brand-700 text-white ring-white/10" : "bg-white text-ink-900 ring-ink-900/5",
        )}
      >
        <p id={titleId} className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {title}
        </p>
        {children && <div className={cn("mt-2 text-sm", tone === "brand" ? "text-brand-50" : "text-ink-600")}>{children}</div>}
        <div className="mt-4 grid gap-2 [&>*]:w-full">{actions}</div>
      </div>
    </div>
  );
}

export function NewBestBadge() {
  return (
    <span className="mt-3 inline-flex items-center rounded-full bg-lime-300 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-lime-950">
      New personal best
    </span>
  );
}
