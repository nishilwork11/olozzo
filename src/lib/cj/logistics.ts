import "server-only";
import { cjPost } from "./client";

// Freight quote. Called at checkout-quote time to show the real CJ shipping cost/ETA
// for the destination. Docs: /api2.0/v1/logistic/freightCalculate
// Prices come back in USD; convert with usdToEurCents at the call site if charging the customer.

export type CjFreightOption = { logisticName: string; priceUsd: number; etaDays: string | null };

type CjFreightRaw = { logisticAname?: string; logisticName?: string; logisticPrice?: string | number; logisticAging?: string; logisticPriceCn?: string | number };

function num(v: string | number | undefined): number {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : v;
  return Number.isFinite(n) ? (n as number) : 0;
}

export async function cjFreight(opts: {
  startCountryCode?: string; // supplier warehouse, e.g. "CN"
  endCountryCode: string; // destination ISO-2
  zip?: string;
  products: { vid: string; quantity: number }[];
}): Promise<CjFreightOption[]> {
  const data = await cjPost<CjFreightRaw[] | { list?: CjFreightRaw[] }>("/logistic/freightCalculate", {
    startCountryCode: opts.startCountryCode ?? "CN",
    endCountryCode: opts.endCountryCode,
    zip: opts.zip,
    products: opts.products,
  });
  const raw = Array.isArray(data) ? data : (data.list ?? []);
  return raw
    .map((o) => ({
      logisticName: o.logisticName ?? o.logisticAname ?? "",
      priceUsd: num(o.logisticPrice ?? o.logisticPriceCn),
      etaDays: o.logisticAging ?? null,
    }))
    .filter((o) => o.logisticName);
}
