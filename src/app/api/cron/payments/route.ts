import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processEmailQueue } from "@/lib/email/outbox";
import { reconcileStripePayments } from "@/lib/payments";

// Safety net for missed Stripe webhooks (see reconcileStripePayments in src/lib/payments/index.ts), and the retry of
// emails that could not be sent (processEmailQueue in src/lib/email/outbox.ts).
// Call it every 15 minutes from any scheduler with the header "Authorization: Bearer <CRON_SECRET>".
// Vercel Cron sends that header itself once CRON_SECRET is set; add to vercel.json (mind your plan's cron frequency limit):
//   { "crons": [{ "path": "/api/cron/payments", "schedule": "*/15 * * * *" }] }
// Elsewhere: crontab, a GitHub Actions schedule or an uptime monitor, e.g.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/payments
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 501 });
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payments = await reconcileStripePayments();
  const emails = await processEmailQueue();
  return NextResponse.json({ ...payments, emails });
}

/** Constant-time comparison (hashing first makes both sides the same length). */
function sameSecret(given: string, expected: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(given), hash(expected));
}
