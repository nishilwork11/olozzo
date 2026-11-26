import "server-only";
import { Prisma } from "@prisma/client";
import { after } from "next/server";
import { db } from "../db";
import { emailTransport, EmailSendError, sendEmail, type OutgoingEmail } from "./send";
import { formatFrom, type EmailContent, type EmailKind } from "./templates";

// Every email is first written to EmailLog, then sent once the request that caused it has answered, so a slow or
// failing email provider never delays or breaks a payment, a webhook or a page. Failed emails are retried by
// /api/cron/payments (processEmailQueue), up to MAX_ATTEMPTS times within two days.

const MAX_ATTEMPTS = 5;

/** What EmailLog.payload holds. The From address is added when sending, so an email recorded before EMAIL_FROM was set still gets it. */
export type StoredEmail = Omit<OutgoingEmail, "from"> & { fromName: string };

export function emailEnabled(): boolean {
  return Boolean(emailTransport() && process.env.EMAIL_FROM);
}

/** What the admin Emails page reports about the configuration (never a key or password). */
export function emailSetup() {
  let smtpServer: string | null = null;
  try {
    if (process.env.SMTP_URL) smtpServer = new URL(process.env.SMTP_URL).host;
  } catch {
    smtpServer = "invalid SMTP_URL";
  }
  return {
    enabled: emailEnabled(),
    transport: emailTransport(),
    smtpServer,
    from: process.env.EMAIL_FROM || null,
    replyTo: process.env.EMAIL_REPLY_TO || null,
  };
}

/** The email as it goes out now: sender built from EMAIL_FROM, replies to the store or EMAIL_REPLY_TO. */
export function outgoing(stored: StoredEmail): OutgoingEmail {
  // Emails recorded by the first version of this code stored a finished "from" instead of the name
  const name = stored.fromName ?? (stored as unknown as { from?: string }).from ?? "olozzo";
  const { fromName: _name, ...rest } = stored;
  return { ...rest, from: formatFrom(name, process.env.EMAIL_FROM ?? ""), replyTo: stored.replyTo || process.env.EMAIL_REPLY_TO || null };
}

export type QueuedEmail = {
  /** Sends the email once: a second email with the same key is dropped (see EmailLog) */
  key: string;
  kind: EmailKind;
  orderId?: string | null;
  to: string[];
  /** Shown as the sender's name, in front of the EMAIL_FROM address */
  fromName: string;
  /** Where replies go; EMAIL_REPLY_TO when not given */
  replyTo?: string | null;
  content: EmailContent;
};

/**
 * Record an email and send it after the current request. Never throws: an email problem must not break the step that
 * triggered it. Returns false when there is no recipient, or an email with this key was already recorded.
 */
export async function queueEmail(email: QueuedEmail): Promise<boolean> {
  const to = [...new Set(email.to.map((address) => address.trim()).filter(Boolean))];
  if (to.length === 0) return false;
  const enabled = emailEnabled();
  const payload: StoredEmail = { fromName: email.fromName, to, replyTo: email.replyTo || null, ...email.content };
  try {
    const row = await db.emailLog.create({
      data: {
        key: email.key,
        kind: email.kind,
        orderId: email.orderId ?? null,
        to: to.join(", "),
        subject: email.content.subject,
        status: enabled ? "QUEUED" : "SKIPPED",
        error: enabled ? null : "Email is not set up: set EMAIL_FROM, and SMTP_URL or RESEND_API_KEY",
        payload,
      },
    });
    if (enabled) deliverSoon(row.id);
    else console.info(`[email] not sent, email is not set up: "${email.content.subject}" to ${to.join(", ")}`);
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false; // sent or queued before
    console.error(`[email] could not record "${email.content.subject}"`, err);
    return false;
  }
}

function deliverSoon(id: string) {
  try {
    after(() => deliverEmail(id));
  } catch {
    // Outside a request (e.g. a script): send right away
    void deliverEmail(id);
  }
}

/** Send one recorded email that is waiting or failed before. Never throws. Returns whether it was sent. */
export async function deliverEmail(id: string): Promise<boolean> {
  try {
    // Claiming it first keeps the request's own send and the cron from sending the same email at the same time
    const claimed = await db.emailLog.updateMany({
      where: { id, status: { in: ["QUEUED", "FAILED"] } },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return false;
    const row = await db.emailLog.findUniqueOrThrow({ where: { id } });
    try {
      if (!row.payload) throw new EmailSendError("The email's content is no longer stored", false);
      // An email sent before and now sent again by staff needs a new key, or Resend would treat it as the same request
      const providerId = await sendEmail(outgoing(row.payload as StoredEmail), row.sentAt ? `${row.id}:${row.sentAt.getTime()}` : row.id);
      await db.emailLog.update({ where: { id }, data: { status: "SENT", providerId, sentAt: new Date(), error: null } });
      return true;
    } catch (err) {
      const retryable = !(err instanceof EmailSendError) || err.retryable;
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[email] "${row.subject}" to ${row.to} failed (attempt ${row.attempts}${retryable ? "" : ", not retried"}): ${error}`);
      await db.emailLog.update({
        where: { id },
        data: { status: "FAILED", error: error.slice(0, 1000), ...(retryable ? {} : { attempts: MAX_ATTEMPTS }) },
      });
      return false;
    }
  } catch (err) {
    console.error("[email] delivery failed", err);
    return false;
  }
}

/**
 * Send one email now: one that was skipped (recorded while email was not set up) or failed, whatever its attempts so
 * far, or one already sent that a customer says never arrived. For staff, from the email's admin page.
 */
export async function sendEmailNow(id: string): Promise<boolean> {
  if (!emailEnabled()) return false;
  const reset = await db.emailLog.updateMany({
    where: { id, status: { in: ["SKIPPED", "FAILED", "SENT"] } },
    data: { status: "QUEUED", attempts: 0, error: null },
  });
  return reset.count > 0 && deliverEmail(id);
}

/**
 * Send emails still waiting (their request ended before sending them) and retry failed ones. Run from
 * /api/cron/payments every 15 minutes, or from admin → Emails.
 */
export async function processEmailQueue(limit = 25) {
  const result = { sent: 0, failed: 0 };
  const now = Date.now();
  // The content of an email is kept for checking and retrying, not for ever
  await db.emailLog.updateMany({
    where: { createdAt: { lt: new Date(now - 90 * 86_400_000) }, NOT: { payload: { equals: Prisma.DbNull } } },
    data: { payload: Prisma.DbNull },
  });
  if (!emailEnabled()) return result;

  // A send cut off midway (the server stopped) is tried again; Resend's idempotency key keeps it from going out twice
  await db.emailLog.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(now - 10 * 60_000) } },
    data: { status: "FAILED", error: "Interrupted while sending" },
  });
  const due = await db.emailLog.findMany({
    where: {
      OR: [
        { status: "QUEUED", createdAt: { lt: new Date(now - 60_000) } },
        { status: "FAILED", attempts: { lt: MAX_ATTEMPTS }, createdAt: { gt: new Date(now - 2 * 86_400_000) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const { id } of due) {
    if (await deliverEmail(id)) result.sent++;
    else result.failed++;
  }
  return result;
}
