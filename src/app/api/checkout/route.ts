import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { storeAcceptsOrders } from "@/lib/catalog";
import { OutOfStockError, createOrderFromQuote, quoteCart, type Quote, type ShippingDetails } from "@/lib/checkout";
import { db } from "@/lib/db";
import { isEuCountry } from "@/lib/eu";
import { newOrderAccessToken, orderPagePath } from "@/lib/order-access";
import { markPaymentFailed } from "@/lib/orders";
import { isProviderAvailable, resumablePaymentUrl, retireUnpaidOrder, startPayment } from "@/lib/payments";
import { paymentLog } from "@/lib/payments/log";
import { errorDetails, errorMessage } from "@/lib/payments/log-details";
import { PAYMENT_WINDOW_MINUTES, checkoutSummary, sameCheckout } from "@/lib/payments/rules";

const schema = z.object({
  storeSlug: z.string().min(1),
  checkoutKey: z.string().uuid().nullish(),
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

/** What the order would contain, in the shape stored on an Order (for comparing with an earlier attempt). */
function snapshot(quote: Quote, shipping: ShippingDetails, provider: string) {
  return {
    total: quote.total,
    paymentProvider: provider,
    discountCode: quote.discountCode,
    email: shipping.email.toLowerCase(),
    name: shipping.name,
    phone: shipping.phone || null,
    addressLine1: shipping.addressLine1,
    addressLine2: shipping.addressLine2 || null,
    city: shipping.city,
    postalCode: shipping.postalCode,
    country: shipping.country,
    items: quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
  };
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check your details." }, { status: 400 });
  }
  const { storeSlug, items, discountCode, provider, shipping } = parsed.data;
  const checkoutKey = parsed.data.checkoutKey ?? randomUUID();

  const store = await db.store.findUnique({ where: { slug: storeSlug } });
  if (!store || !(await storeAcceptsOrders(store))) {
    return NextResponse.json({ error: "This store is not accepting orders." }, { status: 404 });
  }
  if (!isProviderAvailable(provider)) return NextResponse.json({ error: "Please choose a payment method." }, { status: 400 });

  const quote = await quoteCart(store, items, shipping.country, discountCode, { excludeCheckoutKey: checkoutKey });
  if (quote.lines.length === 0) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  if (quote.issues.length > 0) {
    return NextResponse.json({ error: "Some items in your cart changed. Please review your order.", issues: quote.issues }, { status: 409 });
  }
  if (discountCode && quote.discountError) return NextResponse.json({ error: quote.discountError }, { status: 400 });

  // The same checkout retried (double click, back from the payment page, another tab): send the shopper to
  // the payment page they already have instead of creating a second order they could also pay.
  const previous = await db.order.findFirst({
    where: { checkoutKey, storeId: store.id, paymentStatus: { in: ["UNPAID", "PENDING"] }, status: "PENDING" },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  if (previous) {
    if (previous.paymentStatus === "PENDING") {
      await paymentLog({
        orderId: previous.id,
        provider: previous.paymentProvider,
        event: "checkout.still_processing",
        ref: previous.paymentRef,
        message: "The customer tried to pay again while their bank payment is still being processed; no new payment started",
      });
      return NextResponse.json(
        { error: "Your previous payment for this cart is still being processed by your bank.", orderId: previous.id },
        { status: 409 },
      );
    }
    try {
      if (sameCheckout(previous, snapshot(quote, shipping, provider))) {
        const resume = await resumablePaymentUrl(previous);
        if (resume === "complete") {
          await paymentLog({
            orderId: previous.id,
            level: "WARN",
            event: "checkout.already_paid",
            ref: previous.paymentRef,
            message: "The customer tried to pay again, but Stripe shows this payment as completed; no second payment started",
          });
          return NextResponse.json(
            { error: "You have already completed the payment for this order. Check your order status before paying again.", orderId: previous.id },
            { status: 409 },
          );
        }
        if (resume) {
          await paymentLog({
            orderId: previous.id,
            event: "checkout.resumed",
            ref: previous.paymentRef,
            message: "Same checkout submitted again; the customer was sent back to the same payment page",
          });
          return NextResponse.json({ url: resume, orderId: previous.id });
        }
      }
      if ((await retireUnpaidOrder(previous, "Replaced by a newer checkout")) === "paid") {
        return NextResponse.json(
          { error: "You have already paid for your previous checkout. Check your order before ordering again.", orderId: previous.id },
          { status: 409 },
        );
      }
    } catch (err) {
      await paymentLog({
        orderId: previous.id,
        provider: previous.paymentProvider,
        level: "ERROR",
        event: "checkout.retry_failed",
        ref: previous.paymentRef,
        message: `A new checkout for the same cart could not take over this open payment: ${errorMessage(err)}`,
        data: errorDetails(err),
      });
      return NextResponse.json({ error: "We could not update your previous payment. Please try again in a moment." }, { status: 502 });
    }
  }

  const user = await getCurrentUser();
  const access = newOrderAccessToken();
  let order;
  try {
    order = await createOrderFromQuote(store, quote, shipping, provider, user?.id ?? null, {
      checkoutKey,
      accessTokenHash: access.hash,
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000),
    });
  } catch (err) {
    if (err instanceof OutOfStockError) return NextResponse.json({ error: err.message, issues: [err.message] }, { status: 409 });
    throw err;
  }
  await audit(user?.id ?? null, "order.created", "Order", order.id, `${order.number} · ${store.name} · ${provider}`);

  // Where payment sends the shopper back. Locally that is this dev server, whatever port it runs on (a fixed
  // NEXT_PUBLIC_APP_URL breaks as soon as the port changes); in production the configured public URL, because
  // behind a proxy the request's own origin can be an internal address.
  const baseUrl =
    process.env.NODE_ENV === "development" ? req.nextUrl.origin : process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  try {
    const url = await startPayment(order, store, provider, {
      baseUrl,
      accessToken: access.token,
      summary: checkoutSummary(quote.lines),
    });
    // The browser keeps the order link (with its token) so it can point the shopper back to this order later
    return NextResponse.json({ url, orderId: order.id, orderPath: orderPagePath(store.slug, order.id, access.token) });
  } catch (err) {
    // Stripe's own answer (error code, request id) is kept, so the cause can be looked up in the Stripe Dashboard
    await paymentLog({
      orderId: order.id,
      provider,
      level: "ERROR",
      event: "checkout.start_failed",
      message: `The payment could not be started: ${errorMessage(err)}`,
      data: errorDetails(err),
    });
    await markPaymentFailed(order.id, `The payment could not be started: ${errorMessage(err)}`);
    return NextResponse.json({ error: "We could not start the payment. Please try another method." }, { status: 502 });
  }
}
