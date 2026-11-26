import "server-only";

// Mollie REST API (no SDK needed). Popular across NL, BE, DE, FR, AT:
// iDEAL, Bancontact, SOFORT, EPS, Przelewy24, cards, PayPal, Klarna…

const API = "https://api.mollie.com/v2";

export function mollieEnabled(): boolean {
  return Boolean(process.env.MOLLIE_API_KEY);
}

async function mollie<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.MOLLIE_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mollie API error ${res.status}: ${body?.detail ?? res.statusText}`);
  return body as T;
}

export type MolliePayment = {
  id: string;
  status: "open" | "canceled" | "pending" | "authorized" | "expired" | "failed" | "paid";
  metadata?: { orderId?: string } | null;
  _links: { checkout?: { href: string } };
};

const toValue = (cents: number) => (cents / 100).toFixed(2);

export async function createMolliePayment(
  order: { id: string; number: string; total: number },
  opts: { redirectUrl: string; baseUrl: string },
) {
  const isLocal = /localhost|127\.0\.0\.1/.test(opts.baseUrl);
  return mollie<MolliePayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: { currency: "EUR", value: toValue(order.total) },
      description: `Order ${order.number}`,
      redirectUrl: opts.redirectUrl,
      // Mollie cannot reach localhost — on local dev we verify the payment when the customer returns.
      ...(isLocal ? {} : { webhookUrl: `${opts.baseUrl}/api/webhooks/mollie` }),
      metadata: { orderId: order.id },
    }),
  });
}

export async function getMolliePayment(paymentId: string) {
  return mollie<MolliePayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function refundMollie(paymentId: string, amountCents: number) {
  return mollie(`/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: "POST",
    body: JSON.stringify({ amount: { currency: "EUR", value: toValue(amountCents) } }),
  });
}
