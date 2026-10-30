import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { SubmitButton } from "@/components/client";
import { Card, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { emailSetup } from "@/lib/email/outbox";
import { EMAIL_KIND_LABELS } from "@/lib/email/templates";
import { cn, formatDateTime } from "@/lib/utils";
import { adminSendEmails } from "../actions";

export const metadata: Metadata = { title: "Emails · Admin" };

const FILTERS = [
  { key: "problems", label: "Not sent", where: { status: { in: ["FAILED", "SKIPPED", "QUEUED"] } } },
  { key: "customers", label: "To customers", where: { kind: { in: ["order_confirmation", "parcel_shipped", "payment_failed", "refund", "return_received", "return_resolved"] } } },
  { key: "staff", label: "To staff", where: { kind: { in: ["supplier_new_order", "merchant_new_order", "merchant_return", "admin_alert"] } } },
] satisfies { key: string; label: string; where: Prisma.EmailLogWhereInput }[];

export default async function AdminEmails({ searchParams }: { searchParams: Promise<{ filter?: string; order?: string; ok?: string; error?: string }> }) {
  const { filter: filterKey, order: orderQuery, ok, error } = await searchParams;
  const filter = FILTERS.find((f) => f.key === filterKey);
  const order = orderQuery
    ? await db.order.findFirst({
        where: { OR: [{ id: orderQuery.trim() }, { number: { equals: orderQuery.trim(), mode: "insensitive" } }] },
        select: { id: true },
      })
    : null;
  const where: Prisma.EmailLogWhereInput = { ...(filter?.where ?? {}), ...(orderQuery ? { orderId: order?.id ?? "-" } : {}) };
  const [emails, failing] = await Promise.all([
    db.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, omit: { payload: true } }),
    db.emailLog.count({ where: { status: "FAILED" } }),
  ]);
  const orders = await db.order.findMany({
    where: { id: { in: emails.map((e) => e.orderId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, number: true },
  });
  const orderNumber = new Map(orders.map((o) => [o.id, o.number]));
  const setup = emailSetup();

  return (
    <>
      <PageHeader
        title="Emails"
        description="Every email olozzo sends to customers, merchants, suppliers and admins, and whether it was delivered to the email provider (last 200)."
        actions={
          setup.enabled ? (
            <form action={adminSendEmails}>
              <SubmitButton className="btn btn-secondary">Send waiting emails now</SubmitButton>
            </form>
          ) : undefined
        }
      />
      <Flash ok={ok} error={error} />
      {setup.enabled ? (
        <p className="mb-4 text-sm text-ink-500">
          Sending {setup.transport === "smtp" ? `over SMTP (${setup.smtpServer})` : "through Resend"} as <code>{setup.from}</code>.
        </p>
      ) : (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Email sending is off, so emails are only recorded here (status Skipped) and can be previewed. Set <code>EMAIL_FROM</code>, and{" "}
          <code>SMTP_URL</code> (e.g. <code>smtp://localhost:1025</code> for Mailpit) or <code>RESEND_API_KEY</code>, to send them. A skipped
          email can then be sent from its page.
        </p>
      )}
      {setup.enabled && failing > 0 && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {failing} email{failing === 1 ? "" : "s"} failed. Failed emails are retried automatically every 15 minutes for two days, unless the
          provider refused them for good (e.g. an invalid address).
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((f) => {
          const active = f.key === filterKey;
          const qs = new URLSearchParams({ ...(orderQuery ? { order: orderQuery } : {}), ...(active ? {} : { filter: f.key }) }).toString();
          return (
            <Link
              key={f.key}
              href={`/admin/emails${qs ? `?${qs}` : ""}`}
              className={cn("rounded-full px-3 py-1 ring-1 ring-inset", active ? "bg-ink-900 text-white ring-ink-900" : "text-ink-600 ring-ink-200 hover:ring-ink-400")}
            >
              {f.label}
            </Link>
          );
        })}
        <form className="ml-auto flex gap-2">
          {filterKey && <input type="hidden" name="filter" value={filterKey} />}
          <input name="order" defaultValue={orderQuery ?? ""} placeholder="Order number, e.g. OLZ-…" className="input w-56 py-1" />
          <button className="btn btn-secondary btn-sm">Find</button>
        </form>
      </div>

      <Card className="overflow-x-auto">
        {emails.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">No emails.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>When</th>
                <th>Email</th>
                <th>To</th>
                <th>Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap text-ink-500">{formatDateTime(e.createdAt)}</td>
                  <td>
                    <Link href={`/admin/emails/${e.id}`} className="font-medium hover:underline">
                      {e.subject}
                    </Link>
                    <span className="block text-xs text-ink-400">{EMAIL_KIND_LABELS[e.kind as keyof typeof EMAIL_KIND_LABELS] ?? e.kind}</span>
                  </td>
                  <td className="max-w-56 break-all text-ink-600">{e.to}</td>
                  <td className="whitespace-nowrap">
                    {e.orderId ? (
                      <Link href={`/admin/orders/${e.orderId}`} className="font-mono text-xs font-semibold hover:underline">
                        {orderNumber.get(e.orderId) ?? "Deleted order"}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-400">none</span>
                    )}
                  </td>
                  <td className="min-w-40">
                    <StatusBadge status={e.status} />
                    {e.attempts > 1 && <span className="ml-2 text-xs text-ink-400">{e.attempts} attempts</span>}
                    {e.status === "FAILED" && e.error && <span className="mt-1 block max-w-xs text-xs text-red-700">{e.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
