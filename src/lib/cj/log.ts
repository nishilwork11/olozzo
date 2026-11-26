import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Record a CJ API operation. Never throws — logging must not break the caller. */
export async function logCj(
  kind: "auth" | "catalog-sync" | "import" | "order-push" | "track-sync",
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  opts: { refId?: string; data?: Prisma.InputJsonValue } = {},
): Promise<void> {
  try {
    await db.cjSyncLog.create({
      data: { kind, level, message, refId: opts.refId, data: opts.data },
    });
  } catch {
    // swallow — a failed log line must never surface to the storefront or admin action
  }
}
