import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Title row of a shop section: icon, heading, optional extras (e.g. a countdown) and a "See all" link. */
export function SectionHeader({
  id,
  title,
  icon: Icon,
  href,
  linkLabel = "See all",
  children,
  className,
}: {
  /** id of the heading, for the section's aria-labelledby */
  id?: string;
  title: string;
  icon?: LucideIcon;
  href?: string;
  linkLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id={id} className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink-950 sm:text-xl">
          {Icon && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
              <Icon size={16} aria-hidden="true" />
            </span>
          )}
          {title}
        </h2>
        {children}
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {linkLabel}
          {linkLabel === "See all" && <span className="sr-only"> {title}</span>}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export type Crumb = { label: string; href?: string };

/** Breadcrumb trail; the last item is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-ink-500">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="shrink-0 text-ink-400" aria-hidden="true" />}
              {item.href && !last ? (
                <Link href={item.href} className="rounded hover:text-ink-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "line-clamp-1 font-medium text-ink-800")}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
