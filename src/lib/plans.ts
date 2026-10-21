// Merchant subscription plans (Shopify-style). The transaction fee is taken on every paid order.

export type PlanId = "STARTER" | "GROWTH" | "PRO";

export const PLANS: Record<
  PlanId,
  { id: PlanId; name: string; monthly: number; feeRate: number; blurb: string; features: string[] }
> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    monthly: 2900,
    feeRate: 0.02,
    blurb: "Launch your first store",
    features: ["1 online store", "Up to 250 products", "Stripe, Mollie & SEPA", "EU VAT auto-calculation", "2% transaction fee"],
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    monthly: 7900,
    feeRate: 0.01,
    blurb: "For growing brands",
    features: ["Everything in Starter", "Unlimited products", "Discount codes & bundles", "Profit analytics", "1% transaction fee"],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    monthly: 29900,
    feeRate: 0.005,
    blurb: "Scale across Europe",
    features: ["Everything in Growth", "Priority supplier routing", "Custom domain", "Dedicated success manager", "0.5% transaction fee"],
  },
};

export function planFor(id: string) {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "STARTER"];
}
