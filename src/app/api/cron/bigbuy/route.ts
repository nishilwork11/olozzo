import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { bigBuyConfigured } from "@/lib/bigbuy/client";
import { pushPendingBigBuyOrders, syncBigBuyTracking } from "@/lib/bigbuy/orders";
import { syncBigBuyCatalog } from "@/lib/bigbuy/sync";

// BigBuy background jobs: forward paid orders to BigBuy, pull tracking, refresh the catalogue.
// Guarded by the same CRON_SECRET as /api/cron/cj and /api/cron/payments. Call every 15–30 min,
// e.g. via Vercel Cron:
//   { "crons": [{ "path": "/api/cron/bigbuy", "schedule": "*/20 * * * *" }] }
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/bigbuy
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 501 });
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!bigBuyConfigured()) return NextResponse.json({ skipped: "BigBuy not configured" });

  // Run sequentially: all three share the BigBuy request throttle anyway.
  const orders = await pushPendingBigBuyOrders();
  const tracking = await syncBigBuyTracking();
  const catalog = await syncBigBuyCatalog();
  return NextResponse.json({ orders, tracking, catalog });
}

function sameSecret(given: string, expected: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(given), hash(expected));
}
