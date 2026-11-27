import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Record a BigBuy API operation. Never throws — logging must not break the caller. */
export async function logBigBuy(
  kind: "auth" | "catalog-sync" | "import" | "order-check" | "order-push" | "track-sync",
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  opts: { refId?: string; data?: Prisma.InputJsonValue } = {},
): Promise<void> {
  try {
    await db.bigBuySyncLog.create({
      data: { kind, level, message, refId: opts.refId, data: opts.data },
    });
  } catch {
    // swallow — a failed log line must never surface to the storefront or admin action
  }
}
