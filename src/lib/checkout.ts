import "server-only";
import { Prisma, type Store } from "@prisma/client";
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

type DbClient = typeof db | Prisma.TransactionClient;

/**
 * Units held by orders whose payment is still open (not yet expired) or being processed by the bank.
 * Suppliers set absolute stock levels, so holds are counted here instead of being taken off `stock`.
 * `excludeCheckoutKey` leaves out the shopper's own earlier attempt, which a retry replaces.
 */
export async function reservedStock(client: DbClient, variantIds: string[], excludeCheckoutKey?: string | null) {
  if (variantIds.length === 0) return new Map<string, number>();
  const rows = await client.orderItem.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variantIds },
      order: {
        stockReserved: true,
        AND: [
          { OR: [{ paymentStatus: "PENDING" }, { paymentStatus: "UNPAID", paymentExpiresAt: { gt: new Date() } }] },
          ...(excludeCheckoutKey ? [{ OR: [{ checkoutKey: null }, { checkoutKey: { not: excludeCheckoutKey } }] }] : []),
        ],
      },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.variantId ?? "", r._sum.quantity ?? 0]));
}

/**
 * Re-price a cart on the server. Never trust prices from the browser: everything here is
 * looked up from the database (active products, approved suppliers, stock, discount rules).
 */
export async function quoteCart(
  store: Store,
  input: CartLineInput[],
  country: string,
  discountCode?: string | null,
  opts: { excludeCheckoutKey?: string | null } = {},
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
  const reserved = await reservedStock(
    db,
    storeProducts.flatMap((sp) => sp.product.variants.map((v) => v.id)),
    opts.excludeCheckoutKey,
  );

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
    const available = variant.stock - (reserved.get(variant.id) ?? 0);
    if (available <= 0) {
      issues.push(`${sp.title} (${variant.name}) is out of stock.`);
      continue;
    }
    const quantity = Math.min(wanted, available);
    if (quantity < wanted) issues.push(`Only ${available} left of ${sp.title} (${variant.name}).`);

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

export class OutOfStockError extends Error {}

/**
 * Create the order and hold its stock until the payment expires. The variant rows are locked first
 * (in id order, so concurrent checkouts can't deadlock), which stops two shoppers from both getting
 * the last unit.
 */
export async function createOrderFromQuote(
  store: Store,
  quote: Quote,
  shipping: ShippingDetails,
  provider: string,
  customerId: string | null,
  payment: { checkoutKey: string; accessTokenHash: string; expiresAt: Date },
) {
  const wanted = new Map<string, { title: string; quantity: number }>();
  for (const l of quote.lines) {
    const prev = wanted.get(l.variantId);
    wanted.set(l.variantId, { title: `${l.title} (${l.variantName})`, quantity: (prev?.quantity ?? 0) + l.quantity });
  }
  const variantIds = [...wanted.keys()];

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id IN (${Prisma.join(variantIds)}) ORDER BY id FOR UPDATE`;
    const [variants, reserved] = await Promise.all([
      tx.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, stock: true } }),
      reservedStock(tx, variantIds),
    ]);
    for (const [variantId, line] of wanted) {
      const stock = variants.find((v) => v.id === variantId)?.stock ?? 0;
      const available = stock - (reserved.get(variantId) ?? 0);
      if (available < line.quantity) {
        throw new OutOfStockError(
          available > 0 ? `Only ${available} left of ${line.title}.` : `${line.title} has just sold out.`,
        );
      }
    }
    return tx.order.create({
      data: {
        checkoutKey: payment.checkoutKey,
        accessTokenHash: payment.accessTokenHash,
        paymentExpiresAt: payment.expiresAt,
        stockReserved: true,
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
  });
}
