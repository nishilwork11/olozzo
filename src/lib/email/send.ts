import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// How emails leave olozzo: over SMTP when SMTP_URL is set (any SMTP server: Mailpit or Mailhog locally, or a
// provider's SMTP in production), otherwise through Resend's email API. Nothing else depends on the choice.

export type OutgoingEmail = { from: string; to: string[]; replyTo: string | null; subject: string; html: string; text: string };

export class EmailSendError extends Error {
  /** False when sending again cannot help, e.g. an invalid address or an unverified sender domain */
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

export function emailTransport(): "smtp" | "resend" | null {
  if (process.env.SMTP_URL) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

/** Send one email and return its message id. `id` (the EmailLog id) keeps a retried email from going out twice. */
export async function sendEmail(email: OutgoingEmail, id: string): Promise<string> {
  return emailTransport() === "smtp" ? sendWithSmtp(email, id) : sendWithResend(email, id);
}

let smtp: Transporter | null = null;

async function sendWithSmtp(email: OutgoingEmail, id: string): Promise<string> {
  // e.g. smtp://localhost:1025 (Mailpit), smtps://user:pass@smtp.example.com:465, smtp://user:pass@smtp.example.com:587
  smtp ??= nodemailer.createTransport({ url: process.env.SMTP_URL, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 });
  try {
    const info = await smtp.sendMail({
      from: email.from,
      to: email.to,
      replyTo: email.replyTo ?? undefined,
      subject: email.subject,
      html: email.html,
      text: email.text,
      // The same Message-ID on every attempt lets mail systems recognise a retried email
      messageId: `<${id}@${/@([^>\s]+)/.exec(email.from)?.[1] ?? "olozzo.local"}>`,
    });
    return info.messageId;
  } catch (err) {
    // SMTP answers 4xx for temporary problems and 5xx for permanent ones; no answer means the server was not reachable
    const code = (err as { responseCode?: number }).responseCode;
    throw new EmailSendError(`SMTP: ${err instanceof Error ? err.message : String(err)}`, code === undefined || code < 500);
  }
}

/** https://resend.com/docs/api-reference/emails/send-email, called directly: one request, so no SDK. */
async function sendWithResend(email: OutgoingEmail, id: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // Resend sends a request with the same key only once within 24 hours, so a retry after a timeout cannot duplicate an email
        "Idempotency-Key": id,
      },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new EmailSendError(`Could not reach Resend: ${err instanceof Error ? err.message : String(err)}`, true);
  }
  const body = (await res.json().catch(() => null)) as { id?: string; name?: string; message?: string } | null;
  if (res.ok && body?.id) return body.id;
  const retryable = res.status === 409 || res.status === 429 || res.status >= 500;
  throw new EmailSendError(`Resend ${res.status}${body?.name ? ` ${body.name}` : ""}: ${body?.message ?? res.statusText}`, retryable);
}
