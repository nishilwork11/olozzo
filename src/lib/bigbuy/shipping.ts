import "server-only";
import { bbPost } from "./client";

// Freight quote. BigBuy's shipping API returns the real carrier options/costs for a cart and
// destination BEFORE an order is created. Documented in the official guide:
//   POST /rest/shipping/orders.json
//
// Not wired into checkout today (decision: the markup absorbs BigBuy freight, consistent with the
// CJ supplier). Kept here so a future checkout integration can charge exact shipping. Prices are
// EUR; `serviceName` is what you pass as the carrier `name` when creating an order.

export type BbShippingOption = { serviceName: string; name: string; costEur: number; delay: string | null };

type BbShippingRaw = {
  shippingOptions?: {
    shippingService?: { id?: string; name?: string; serviceName?: string; delay?: string };
    cost?: number;
    weight?: number;
  }[];
};

export async function bigBuyShipping(opts: {
  isoCountry: string; // destination ISO-2
  postcode: string;
  products: { reference: string; quantity: number }[];
}): Promise<BbShippingOption[]> {
  const data = await bbPost<BbShippingRaw>("/rest/shipping/orders.json", {
    order: {
      delivery: { isoCountry: opts.isoCountry, postcode: opts.postcode },
      products: opts.products,
    },
  });
  return (data.shippingOptions ?? [])
    .map((o) => ({
      serviceName: o.shippingService?.serviceName ?? o.shippingService?.name ?? "",
      name: o.shippingService?.name ?? o.shippingService?.serviceName ?? "",
      costEur: Number(o.cost) || 0,
      delay: o.shippingService?.delay ?? null,
    }))
    .filter((o) => o.serviceName);
}
