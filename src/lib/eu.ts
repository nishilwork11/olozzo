// EU-27 destination countries and standard VAT rates (OSS — VAT of the customer's country
// applies to B2C distance sales). Rates as of 2026; verify with your tax advisor before going live.

export type EuCountry = { code: string; name: string; vat: number };

export const EU_COUNTRIES: EuCountry[] = [
  { code: "AT", name: "Austria", vat: 0.2 },
  { code: "BE", name: "Belgium", vat: 0.21 },
  { code: "BG", name: "Bulgaria", vat: 0.2 },
  { code: "HR", name: "Croatia", vat: 0.25 },
  { code: "CY", name: "Cyprus", vat: 0.19 },
  { code: "CZ", name: "Czechia", vat: 0.21 },
  { code: "DK", name: "Denmark", vat: 0.25 },
  { code: "EE", name: "Estonia", vat: 0.24 },
  { code: "FI", name: "Finland", vat: 0.255 },
  { code: "FR", name: "France", vat: 0.2 },
  { code: "DE", name: "Germany", vat: 0.19 },
  { code: "GR", name: "Greece", vat: 0.24 },
  { code: "HU", name: "Hungary", vat: 0.27 },
  { code: "IE", name: "Ireland", vat: 0.23 },
  { code: "IT", name: "Italy", vat: 0.22 },
  { code: "LV", name: "Latvia", vat: 0.21 },
  { code: "LT", name: "Lithuania", vat: 0.21 },
  { code: "LU", name: "Luxembourg", vat: 0.17 },
  { code: "MT", name: "Malta", vat: 0.18 },
  { code: "NL", name: "Netherlands", vat: 0.21 },
  { code: "PL", name: "Poland", vat: 0.23 },
  { code: "PT", name: "Portugal", vat: 0.23 },
  { code: "RO", name: "Romania", vat: 0.21 },
  { code: "SK", name: "Slovakia", vat: 0.23 },
  { code: "SI", name: "Slovenia", vat: 0.22 },
  { code: "ES", name: "Spain", vat: 0.21 },
  { code: "SE", name: "Sweden", vat: 0.25 },
];

const BY_CODE = new Map(EU_COUNTRIES.map((c) => [c.code, c]));

export function isEuCountry(code: string): boolean {
  return BY_CODE.has(code);
}

export function countryName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}

export function vatRateFor(code: string): number {
  return BY_CODE.get(code)?.vat ?? 0.21;
}

/** VAT contained in a gross amount. */
export function vatFromGross(grossCents: number, rate: number): number {
  return Math.round(grossCents - grossCents / (1 + rate));
}
