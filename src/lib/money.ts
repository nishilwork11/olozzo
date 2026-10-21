const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/** Format integer cents as EUR, e.g. 12999 → "€129.99". */
export function formatMoney(cents: number): string {
  return eur.format((cents || 0) / 100);
}

/** Parse "12.50" / "12,50" / 12.5 into cents. Returns NaN when invalid. */
export function toCents(value: FormDataEntryValue | string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return NaN;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Cents → "12.50" for form inputs. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
