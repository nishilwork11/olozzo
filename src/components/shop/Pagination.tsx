import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type QueryParams = Record<string, string | undefined>;

/** `path` with the given query parameters (empty values are left out) and an optional #anchor. */
export function hrefWith(path: string, params: QueryParams, patch: QueryParams = {}, anchor?: string): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) if (value) search.set(key, value);
  const qs = search.toString();
  return `${path}${qs ? `?${qs}` : ""}${anchor ? `#${anchor}` : ""}`;
}

/** Page numbers to show: first, last and the neighbours of the current page, with gaps as null. */
function pageList(page: number, pageCount: number): (number | null)[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  // avoid a gap of a single page ("1 … 3" becomes "1 2 3")
  if (pages.has(3) || page <= 3) pages.add(2);
  if (pages.has(pageCount - 2) || page >= pageCount - 2) pages.add(pageCount - 1);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const list: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) list.push(null);
    list.push(p);
  });
  return list;
}

const itemClass =
  "h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

/** Previous / numbered / next links for a paginated listing. Page 1 has no ?page parameter. */
export function Pagination({
  page,
  pageCount,
  path,
  params,
  anchor,
  className,
}: {
  page: number;
  pageCount: number;
  path: string;
  /** current query parameters, kept on every page link */
  params: QueryParams;
  /** element id to jump to, e.g. "explore" */
  anchor?: string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => hrefWith(path, params, { page: p > 1 ? String(p) : undefined }, anchor);
  const edge = (target: number, label: string, rel: "prev" | "next", disabled: boolean) => {
    const content =
      rel === "prev" ? (
        <>
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </>
      ) : (
        <>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={16} aria-hidden="true" />
        </>
      );
    const cls = cn(itemClass, "flex gap-1 border border-ink-200 bg-white");
    return disabled ? (
      <span aria-disabled="true" className={cn(cls, "cursor-not-allowed text-ink-300")}>
        {content}
        <span className="sr-only sm:hidden">{label}</span>
      </span>
    ) : (
      <Link href={href(target)} rel={rel} aria-label={label} className={cn(cls, "text-ink-700 hover:border-ink-300 hover:bg-ink-50")}>
        {content}
      </Link>
    );
  };

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-1.5", className)}>
      {edge(page - 1, "Previous page", "prev", page <= 1)}
      <p className="px-2 text-sm text-ink-600 sm:hidden">
        Page {page} of {pageCount}
      </p>
      <ul className="hidden items-center gap-1 sm:flex">
        {pageList(page, pageCount).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} className="px-1 text-ink-400" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={href(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(itemClass, "flex", p === page ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100")}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ul>
      {edge(page + 1, "Next page", "next", page >= pageCount)}
    </nav>
  );
}
