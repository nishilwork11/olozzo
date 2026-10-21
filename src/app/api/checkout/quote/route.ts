import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { quoteCart } from "@/lib/checkout";
import { db } from "@/lib/db";

const schema = z.object({
  storeSlug: z.string().min(1),
  items: z
    .array(z.object({ storeProductId: z.string(), variantId: z.string(), quantity: z.number().int().min(1).max(99) }))
    .max(50),
  country: z.string().length(2),
  discountCode: z.string().max(40).nullish(),
});

/** Live server-side pricing for the checkout page (VAT per country, shipping, discount). */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { storeSlug, items, country, discountCode } = parsed.data;

  const store = await db.store.findUnique({ where: { slug: storeSlug } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const quote = await quoteCart(store, items, country, discountCode);
  // Never expose supplier cost data to shoppers
  return NextResponse.json({
    lines: quote.lines.map((l) => ({
      storeProductId: l.storeProductId,
      variantId: l.variantId,
      title: l.title,
      variantName: l.variantName,
      image: l.image,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    issues: quote.issues,
    subtotal: quote.subtotal,
    discountCode: quote.discountCode,
    discountTotal: quote.discountTotal,
    discountError: quote.discountError,
    shippingTotal: quote.shippingTotal,
    vatRate: quote.vatRate,
    vatTotal: quote.vatTotal,
    total: quote.total,
  });
}
