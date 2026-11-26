import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, CardHeader, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { emailEnabled, outgoing, type StoredEmail } from "@/lib/email/outbox";
import { EMAIL_KIND_LABELS } from "@/lib/email/templates";
import { formatDateTime } from "@/lib/utils";
import { adminSendEmailNow } from "../../actions";

export const metadata: Metadata = { title: "Email · Admin" };

/** One email as it was sent (or would be, when sending is off). */
export default async function AdminEmail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const email = await db.emailLog.findUnique({ where: { id } });
  if (!email) notFound();
  const payload = email.payload ? outgoing(email.payload as StoredEmail) : null;
  const order = email.orderId ? await db.order.findUnique({ where: { id: email.orderId }, select: { id: true, number: true } }) : null;
  const canSendNow = emailEnabled() && payload && ["SKIPPED", "FAILED", "SENT"].includes(email.status);

  return (
    <>
      <Link href="/admin/emails" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> Emails
      </Link>
      <PageHeader
        title={email.subject}
        description={EMAIL_KIND_LABELS[email.kind as keyof typeof EMAIL_KIND_LABELS] ?? email.kind}
        actions={
          <>
            {canSendNow && (
              <form action={adminSendEmailNow.bind(null, email.id)}>
                {email.status === "SENT" ? (
                  <SubmitButton className="btn btn-secondary" confirm={`This email was already sent. Send it again to ${email.to}?`}>
                    Send again
                  </SubmitButton>
                ) : (
                  <SubmitButton className="btn btn-secondary">Send now</SubmitButton>
                )}
              </form>
            )}
            <StatusBadge status={email.status} />
          </>
        }
      />
      <Flash {...flash} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {payload ? (
              // Sandboxed with no permissions: the email's HTML cannot run scripts or reach this page
              <iframe title="Email preview" sandbox="" srcDoc={payload.html} className="h-[900px] w-full bg-white" />
            ) : (
              <p className="p-5 text-sm text-ink-500">The content of this email is no longer stored (it is kept for 90 days).</p>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-5 text-sm">
              <dt className="text-ink-500">From</dt>
              <dd className="break-all">{payload?.from || "—"}</dd>
              <dt className="text-ink-500">To</dt>
              <dd className="break-all">{email.to}</dd>
              {payload?.replyTo && (
                <>
                  <dt className="text-ink-500">Reply to</dt>
                  <dd className="break-all">{payload.replyTo}</dd>
                </>
              )}
              <dt className="text-ink-500">Order</dt>
              <dd>
                {order ? (
                  <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs font-semibold hover:underline">
                    {order.number}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-ink-500">Created</dt>
              <dd>{formatDateTime(email.createdAt)}</dd>
              {email.sentAt && (
                <>
                  <dt className="text-ink-500">Sent</dt>
                  <dd>{formatDateTime(email.sentAt)}</dd>
                </>
              )}
              <dt className="text-ink-500">Attempts</dt>
              <dd>{email.attempts}</dd>
              {email.providerId && (
                <>
                  <dt className="text-ink-500">Message id</dt>
                  <dd className="break-all font-mono text-xs">{email.providerId}</dd>
                </>
              )}
              {email.error && (
                <>
                  <dt className="text-ink-500">Error</dt>
                  <dd className={email.status === "FAILED" ? "text-red-700" : "text-ink-600"}>{email.error}</dd>
                </>
              )}
            </dl>
          </Card>
          {payload && (
            <Card>
              <CardHeader title="Plain-text version" />
              <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs text-ink-700 [overflow-wrap:anywhere]">{payload.text}</pre>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
