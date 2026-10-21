import "server-only";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { isEuCountry, vatFromGross, vatRateFor } from "./eu";
import { formatMoney } from "./money";
import { planFor } from "./plans";
import { variantRetailPrice } from "./pricing";
import { parseImages, randomCode } from "./utils";

export type CartLineInput = { storeProductId: string; variantId: string; quantity: number };

export type QuoteLine = {
  storeProductId: string;
  productId: string;
  variantId: string;
  supplierId: string;
  title: string;
  variantName: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  shippingCost: number;
  lineTotal: number;
};

export type Quote = {
  lines: QuoteLine[];
  issues: string[];
  subtotal: number;
  discountCode: string | null;
  discountTotal: number;
  discountError: string | null;
  shippingTotal: number;
  vatRate: number;
  vatTotal: number;
  total: number;
  costTotal: number;
  platformFee: number;
};

/**
 * Re-price a cart on the server. Never trust prices from the browser: everything here is
 * looked up from the database (active products, approved suppliers, stock, discount rules).
 */
export async function quoteCart(
  store: Store,
  input: CartLineInput[],
  country: string,
  discountCode?: string | null,
): Promise<Quote> {
  const ids = [...new Set(input.map((i) => i.storeProductId))];
  const storeProducts = await db.storeProduct.findMany({
    where: {
      id: { in: ids },
      storeId: store.id,
      active: true,
      product: { active: true, supplier: { status: "APPROVED" } },
    },
    include: { product: { include: { variants: true } } },
  });
  const byId = new Map(storeProducts.map((sp) => [sp.id, sp]));

  // Merge duplicate lines (same product + variant)
  const merged = new Map<string, CartLineInput>();
  for (const item of input) {
    const key = `${item.storeProductId}:${item.variantId}`;
    const prev = merged.get(key);
    merged.set(key, { ...item, quantity: (prev?.quantity ?? 0) + item.quantity });
  }

  const lines: QuoteLine[] = [];
  const issues: string[] = [];
  for (const item of merged.values()) {
    const wanted = Math.min(99, Math.max(1, Math.floor(Number(item.quantity) || 1)));
    const sp = byId.get(item.storeProductId);
    if (!sp) {
      issues.push("An item in your cart is no longer available and was removed.");
      continue;
    }
    const variant = sp.product.variants.find((v) => v.id === item.variantId);
    if (!variant) {
      issues.push(`${sp.title}: the selected option is no longer available.`);
      continue;
    }
    if (variant.stock <= 0) {
      issues.push(`${sp.title} (${variant.name}) is out of stock.`);
      continue;
    }
    const quantity = Math.min(wanted, variant.stock);
    if (quantity < wanted) issues.push(`Only ${variant.stock} left of ${sp.title} (${variant.name}).`);

    const unitPrice = variantRetailPrice(sp.price, sp.product.costPrice, variant.costPrice);
    lines.push({
      storeProductId: sp.id,
      productId: sp.productId,
      variantId: variant.id,
      supplierId: sp.product.supplierId,
      title: sp.title,
      variantName: variant.name,
      image: parseImages(sp.product.images)[0] ?? null,
      quantity,
      unitPrice,
      unitCost: variant.costPrice,
      shippingCost: sp.product.shippingCost,
      lineTotal: unitPrice * quantity,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let discountTotal = 0;
  let appliedCode: string | null = null;
  let discountError: string | null = null;
  const code = discountCode?.trim().toUpperCase();
  if (code) {
    const d = await db.discountCode.findUnique({ where: { storeId_code: { storeId: store.id, code } } });
    if (!d || !d.active) discountError = "This discount code is not valid.";
    else if (d.expiresAt && d.expiresAt < new Date()) discountError = "This discount code has expired.";
    else if (d.maxUses !== null && d.usedCount >= d.maxUses) discountError = "This discount code has been fully redeemed.";
    else if (subtotal < d.minSubtotal) discountError = `Spend at least ${formatMoney(d.minSubtotal)} to use this code.`;
    else {
      discountTotal = d.type === "PERCENT" ? Math.round((subtotal * Math.min(100, d.value)) / 100) : Math.min(subtotal, d.value);
      appliedCode = d.code;
    }
  }

  const afterDiscount = subtotal - discountTotal;
  const freeShipping = store.freeShippingOver !== null && afterDiscount >= store.freeShippingOver;
  const shippingTotal = lines.length === 0 || freeShipping ? 0 : store.shippingRate;
  const total = afterDiscount + shippingTotal;

  const vatRate = vatRateFor(isEuCountry(country) ? country : store.country);
  const vatTotal = vatFromGross(total, vatRate);

  // Merchant cost = supplier unit costs + one shipping fee per supplier (highest of their items)
  const supplierShipping = new Map<string, number>();
  for (const l of lines) {
    supplierShipping.set(l.supplierId, Math.max(supplierShipping.get(l.supplierId) ?? 0, l.shippingCost));
  }
  const costTotal =
    lines.reduce((s, l) => s + l.unitCost * l.quantity, 0) + [...supplierShipping.values()].reduce((s, v) => s + v, 0);
  const platformFee = Math.round(total * planFor(store.plan).feeRate);

  return {
    lines,
    issues,
    subtotal,
    discountCode: appliedCode,
    discountTotal,
    discountError,
    shippingTotal,
    vatRate,
    vatTotal,
    total,
    costTotal,
    platformFee,
  };
}

export type ShippingDetails = {
  email: string;
  name: string;
  phone?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  postalCode: string;
  country: string;
};

export async function createOrderFromQuote(
  store: Store,
  quote: Quote,
  shipping: ShippingDetails,
  provider: string,
  customerId: string | null,
) {
  return db.order.create({
    data: {
      number: `OLZ-${randomCode(8)}`,
      storeId: store.id,
      customerId,
      email: shipping.email.toLowerCase(),
      name: shipping.name,
      phone: shipping.phone || null,
      addressLine1: shipping.addressLine1,
      addressLine2: shipping.addressLine2 || null,
      city: shipping.city,
      postalCode: shipping.postalCode,
      country: shipping.country,
      paymentProvider: provider,
      subtotal: quote.subtotal,
      discountCode: quote.discountCode,
      discountTotal: quote.discountTotal,
      shippingTotal: quote.shippingTotal,
      vatRate: quote.vatRate,
      vatTotal: quote.vatTotal,
      total: quote.total,
      costTotal: quote.costTotal,
      platformFee: quote.platformFee,
      items: {
        create: quote.lines.map((l) => ({
          storeProductId: l.storeProductId,
          productId: l.productId,
          variantId: l.variantId,
          supplierId: l.supplierId,
          title: l.title,
          variantName: l.variantName,
          image: l.image,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitCost: l.unitCost,
          shippingCost: l.shippingCost,
        })),
      },
    },
  });
}
