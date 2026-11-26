import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cjConfigured } from "@/lib/cj/client";
import { pushPendingCjOrders, syncCjTracking } from "@/lib/cj/orders";
import { syncCjCatalog } from "@/lib/cj/sync";

// CJdropshipping background jobs: forward paid orders to CJ, pull tracking, refresh the catalogue.
// Guarded by the same CRON_SECRET as /api/cron/payments. Call every 15–30 minutes, e.g. via Vercel Cron:
//   { "crons": [{ "path": "/api/cron/cj", "schedule": "*/20 * * * *" }] }
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/cj
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 501 });
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!cjConfigured()) return NextResponse.json({ skipped: "CJ not configured" });

  // Run sequentially: all three share the CJ request throttle anyway.
  const orders = await pushPendingCjOrders();
  const tracking = await syncCjTracking();
  const catalog = await syncCjCatalog();
  return NextResponse.json({ orders, tracking, catalog });
}

function sameSecret(given: string, expected: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(given), hash(expected));
}
