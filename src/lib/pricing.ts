// Pricing rules shared by the importer, storefront and checkout.

/** Round a cent amount up to the next x.99 (e.g. 4312 → 4399). */
export function endWith99(cents: number): number {
  return Math.max(99, Math.ceil(cents / 100) * 100 - 1);
}

/** Retail price for an imported product using the store's pricing rule. */
export function retailFromCost(costCents: number, markupPercent: number, ending99: boolean): number {
  const raw = Math.round(costCents * (1 + markupPercent / 100));
  return ending99 ? endWith99(raw) : raw;
}

/**
 * Retail price of a specific variant. The merchant sets one price for the base product;
 * variants that cost the supplier more/less are priced proportionally.
 */
export function variantRetailPrice(baseRetail: number, baseCost: number, variantCost: number): number {
  if (!baseCost || variantCost === baseCost) return baseRetail;
  return endWith99(Math.round((baseRetail * variantCost) / baseCost));
}

export function marginRate(retailGross: number, cost: number, vatRate = 0.19): number {
  const net = retailGross / (1 + vatRate);
  return net > 0 ? (net - cost) / net : 0;
}
