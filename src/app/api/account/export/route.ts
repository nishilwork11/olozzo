import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** GDPR data export (Art. 15 / Art. 20): everything linked to the signed-in user, as JSON. */
export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      marketingOptIn: true,
      createdAt: true,
      updatedAt: true,
      store: true,
      supplier: true,
      orders: { include: { items: true, returns: true, fulfillments: { select: { status: true, carrier: true, trackingNumber: true, shippedAt: true, deliveredAt: true } } } },
      auditLogs: { select: { action: true, details: true, createdAt: true } },
    },
  });

  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), controller: "olozzo", user }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="olozzo-data-${user.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
