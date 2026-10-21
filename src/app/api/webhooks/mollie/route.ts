import { NextResponse, type NextRequest } from "next/server";
import { markOrderPaid, markPaymentFailed } from "@/lib/orders";
import { getMolliePayment, mollieEnabled } from "@/lib/payments/mollie";

// Mollie posts `id=tr_xxx` (form-encoded). We never trust the body: the payment is fetched
// from the Mollie API with our secret key before any order is updated.
export async function POST(req: NextRequest) {
  if (!mollieEnabled()) return NextResponse.json({ error: "Mollie not configured" }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const paymentId = form?.get("id");
  if (typeof paymentId !== "string") return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const payment = await getMolliePayment(paymentId);
    const orderId = payment.metadata?.orderId;
    if (orderId) {
      if (payment.status === "paid") await markOrderPaid(orderId, payment.id);
      else if (["canceled", "expired", "failed"].includes(payment.status)) await markPaymentFailed(orderId, `Mollie: ${payment.status}`);
    }
  } catch (err) {
    console.error("[mollie] webhook error", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  return new NextResponse("OK");
}
