import Form from "next/form";
import Link from "next/link";
import { Check } from "lucide-react";
import { hrefWith, type QueryParams } from "@/components/shop/Pagination";
import { cn } from "@/lib/utils";

/** Pill style shared by the listing filters and category chips. */
export function chipClass(active: boolean): string {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
    active ? "border-brand-700 bg-brand-700 font-medium text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-950",
  );
}

const PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "Under €10", max: 10 },
  { label: "€10–25", min: 10, max: 25 },
  { label: "€25–50", min: 25, max: 50 },
  { label: "€50–100", min: 50, max: 100 },
  { label: "Over €100", min: 100 },
];

/** "12.5" / "12,50" (euros) → cents; undefined when empty or not a sensible amount. */
function toCents(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) : undefined;
}

const toParam = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/**
 * Reads ?min= and ?max= (euros) into cents for the catalog query, swapping them when entered the wrong
 * way round. `min` / `max` are the cleaned-up values for links and inputs.
 */
export function readPriceRange(min: string | undefined, max: string | undefined) {
  let minPrice = toCents(min);
  let maxPrice = toCents(max);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    minPrice,
    maxPrice,
    min: minPrice !== undefined ? toParam(minPrice) : undefined,
    max: maxPrice !== undefined ? toParam(maxPrice) : undefined,
  };
}

/** Price ranges as one-tap chips plus a custom min–max form (GET, so it works without JavaScript). */
export function PriceFilter({ path, params, min, max }: { path: string; params: QueryParams; min?: string; max?: string }) {
  const rest: QueryParams = { ...params, min: undefined, max: undefined, page: undefined };
  return (
    <div role="group" aria-label="Price" className="flex shrink-0 items-center gap-1.5">
      {PRESETS.map((p) => {
        const pMin = p.min?.toString();
        const pMax = p.max?.toString();
        const active = pMin === min && pMax === max;
        return (
          <Link
            key={p.label}
            href={hrefWith(path, rest, active ? {} : { min: pMin, max: pMax })}
            aria-current={active ? "true" : undefined}
            className={chipClass(active)}
          >
            {p.label}
          </Link>
        );
      })}
      <Form action={path} key={`${min}-${max}`} className="flex shrink-0 items-center gap-1">
        {Object.entries(rest).map(([name, v]) => (v ? <input key={name} type="hidden" name={name} value={v} /> : null))}
        <label htmlFor="price-min" className="sr-only">
          Minimum price in euros
        </label>
        <input
          id="price-min"
          name="min"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          defaultValue={min}
          placeholder="€ Min"
          className="input w-[5.5rem] rounded-full py-1.5 text-sm"
        />
        <span aria-hidden="true" className="text-ink-400">
          –
        </span>
        <label htmlFor="price-max" className="sr-only">
          Maximum price in euros
        </label>
        <input
          id="price-max"
          name="max"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          defaultValue={max}
          placeholder="€ Max"
          className="input w-[5.5rem] rounded-full py-1.5 text-sm"
        />
        <button type="submit" className="btn btn-secondary btn-sm rounded-full">
          Go<span className="sr-only">: filter by price</span>
        </button>
      </Form>
    </div>
  );
}

/** "Deals only" switch: a link that adds or removes ?deals=1 (products with a real discount). */
export function DealsToggle({ path, params, active }: { path: string; params: QueryParams; active: boolean }) {
  return (
    <Link href={hrefWith(path, params, { deals: active ? undefined : "1", page: undefined })} className={chipClass(active)}>
      <span
        aria-hidden="true"
        className={cn("grid h-4 w-4 place-items-center rounded border", active ? "border-white bg-white text-brand-700" : "border-ink-300 bg-white")}
      >
        {active && <Check size={12} strokeWidth={3} />}
      </span>
      Deals only
      <span className="sr-only">{active ? " (on, select to show all prices)" : ""}</span>
    </Link>
  );
}
