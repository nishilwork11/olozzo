"use client";

import Form from "next/form";
import { useId } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sort order as a GET form that submits on change (with a button when JavaScript is off). Other filters
 * travel along as hidden fields; the page number is dropped so the new order starts at page 1.
 */
export function SortSelect({
  action,
  value,
  options,
  hidden,
  className,
}: {
  action: string;
  value: string;
  options: { value: string; label: string }[];
  hidden: Record<string, string | undefined>;
  className?: string;
}) {
  const id = useId();
  return (
    <Form action={action} className={cn("flex items-center gap-2", className)}>
      {Object.entries(hidden).map(([name, v]) => (v ? <input key={name} type="hidden" name={name} value={v} /> : null))}
      <label htmlFor={id} className="flex items-center gap-1 whitespace-nowrap text-sm text-ink-500">
        <ArrowUpDown size={14} aria-hidden="true" />
        Sort by
      </label>
      <select
        // remount when the URL changes (e.g. back button) so the shown option matches the page
        key={value}
        id={id}
        name="sort"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input w-auto cursor-pointer py-1.5 pl-2.5 pr-8 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn btn-secondary btn-sm">
          Apply
        </button>
      </noscript>
    </Form>
  );
}
