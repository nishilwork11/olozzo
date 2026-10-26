import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { createOrderFromQuote, quoteCart } from "@/lib/checkout";
import { db } from "@/lib/db";
import { isEuCountry } from "@/lib/eu";
import { isProviderAvailable, startPayment } from "@/lib/payments";

const schema = z.object({
  storeSlug: z.string().min(1),
  items: z
    .array(z.object({ storeProductId: z.string(), variantId: z.string(), quantity: z.number().int().min(1).max(99) }))
    .min(1, "Your cart is empty")
    .max(50),
  discountCode: z.string().max(40).nullish(),
  provider: z.string(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the terms and withdrawal policy." }) }),
  shipping: z.object({
    email: z.string().email("Please enter a valid email address.").max(160),
    name: z.string().min(2, "Please enter your full name.").max(100),
    phone: z.string().max(40).nullish(),
    addressLine1: z.string().min(3, "Please enter your street address.").max(160),
    addressLine2: z.string().max(160).nullish(),
    city: z.string().min(1, "Please enter your city.").max(80),
    postalCode: z.string().min(2, "Please enter your postal code.").max(16),
    country: z.string().refine(isEuCountry, "We currently ship to EU countries only."),
  }),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check your details." }, { status: 400 });
  }
  const { storeSlug, items, discountCode, provider, shipping } = parsed.data;

  const store = await db.store.findUnique({ where: { slug: storeSlug } });
  if (!store || !store.published) return NextResponse.json({ error: "This store is not accepting orders." }, { status: 404 });
  if (!isProviderAvailable(provider)) return NextResponse.json({ error: "Please choose a payment method." }, { status: 400 });

  const quote = await quoteCart(store, items, shipping.country, discountCode);
  if (quote.lines.length === 0) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  if (quote.issues.length > 0) {
    return NextResponse.json({ error: "Some items in your cart changed. Please review your order.", issues: quote.issues }, { status: 409 });
  }
  if (discountCode && quote.discountError) return NextResponse.json({ error: quote.discountError }, { status: 400 });

  const user = await getCurrentUser();
  const order = await createOrderFromQuote(store, quote, shipping, provider, user?.id ?? null);
  await audit(user?.id ?? null, "order.created", "Order", order.id, `${order.number} · ${store.name} · ${provider}`);

  // Where payment sends the shopper back. Locally that is this dev server, whatever port it runs on (a fixed
  // NEXT_PUBLIC_APP_URL breaks as soon as the port changes); in production the configured public URL, because
  // behind a proxy the request's own origin can be an internal address.
  const baseUrl =
    process.env.NODE_ENV === "development" ? req.nextUrl.origin : process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  try {
    const url = await startPayment(order, store, provider, baseUrl, quote.lines.reduce((s, l) => s + l.quantity, 0));
    return NextResponse.json({ url, orderId: order.id });
  } catch (err) {
    console.error("[checkout] payment start failed", err);
    await db.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED", status: "CANCELLED" } });
    return NextResponse.json({ error: "We could not start the payment. Please try another method." }, { status: 502 });
  }
}
