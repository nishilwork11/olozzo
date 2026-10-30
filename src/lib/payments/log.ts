import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { LogData } from "./log-details";

export type PaymentLogLevel = "INFO" | "WARN" | "ERROR";

export type PaymentLogEntry = {
  orderId?: string | null;
  provider?: string;
  level?: PaymentLogLevel;
  /** One of PAYMENT_EVENT_LABELS (log-details.ts) */
  event: string;
  message: string;
  ref?: string | null;
  data?: LogData | null;
  /** Skip the database write when the same event was stored for the same order this recently (for public endpoints that anyone can call repeatedly). */
  throttleSeconds?: number;
};

/**
 * Record one step of a payment. Never throws: a logging problem must not break a checkout or make Stripe retry a
 * webhook. Also printed to the server log, so the entry still exists somewhere when the database is unreachable.
 */
export async function paymentLog(entry: PaymentLogEntry): Promise<void> {
  const { orderId = null, provider = "stripe", level = "INFO", event, message, ref = null, data = null, throttleSeconds } = entry;
  const line = `[payments] ${level} ${event}${orderId ? ` order=${orderId}` : ""}${ref ? ` ref=${ref}` : ""}: ${message}`;
  if (level === "ERROR") console.error(line, data ?? "");
  else if (level === "WARN") console.warn(line, data ?? "");
  else console.info(line);

  try {
    if (throttleSeconds) {
      const since = new Date(Date.now() - throttleSeconds * 1000);
      if (await db.paymentLog.findFirst({ where: { event, orderId, createdAt: { gt: since } }, select: { id: true } })) return;
    }
    await db.paymentLog.create({
      data: {
        orderId,
        provider,
        level,
        event,
        message,
        ref,
        // A JSON round trip drops undefined values and anything that is not plain data
        ...(data ? { data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (err) {
    console.error("[payments] failed to write the payment log", err);
  }
}
