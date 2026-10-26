"use client";

import Form from "next/form";
import { usePathname, useSearchParams } from "next/navigation";
import { useId } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchFormProps = {
  defaultValue?: string;
  className?: string;
  /** Called when a search is submitted (the mobile menu closes itself). */
  onSubmitted?: () => void;
};

/** Site-wide product search: GET /search?q=… */
export function SearchForm({ defaultValue = "", className, onSubmitted }: SearchFormProps) {
  const id = useId();
  return (
    <Form action="/search" prefetch={false} role="search" className={cn("relative w-full", className)} onSubmit={() => onSubmitted?.()}>
      <label htmlFor={id} className="sr-only">
        Search olozzo
      </label>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search products"
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
        className="h-11 w-full min-w-0 rounded-full border-2 border-brand-600 bg-white pl-4 pr-14 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-4 focus:ring-brand-500/20 sm:pr-28 sm:text-sm"
      />
      <button
        type="submit"
        className="absolute inset-y-1 right-1 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:px-4"
      >
        <Search size={18} aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Search</span>
      </button>
    </Form>
  );
}

/** The search form, pre-filled with the current query while on /search. */
export function SearchBar(props: Omit<SearchFormProps, "defaultValue">) {
  const pathname = usePathname();
  const params = useSearchParams();
  const q = pathname === "/search" ? (params.get("q") ?? "") : "";
  // Re-mount on a new query so the field shows it (the input is uncontrolled)
  return <SearchForm key={q} defaultValue={q} {...props} />;
}
