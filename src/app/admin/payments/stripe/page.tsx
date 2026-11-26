import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/payments/log-details";
import { stripePaymentUrl } from "@/lib/payments/rules";
import { listStripePayments, stripeEnabled, stripeMode } from "@/lib/payments/stripe";
import { checkStripePayment, formatAmount, stripePaymentOf, stripeStatusLabel, type PaymentCheck } from "@/lib/payments/stripe-check";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Stripe payments · Admin" };

const PAGE_SIZE = 50;

function CheckResult({ check }: { check: PaymentCheck }) {
  if (check.state === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 size={14} /> Matches
      </span>
    );
  }
  return (
    <ul className={cn("space-y-0.5 text-xs", check.state === "problem" ? "font-medium text-red-700" : "text-ink-500")}>
      {check.notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

export default async function AdminStripePayments({ searchParams }: { searchParams: Promise<{ after?: string; problems?: string }> }) {
  const { after, problems } = await searchParams;
  const header = (
    <>
      <Link href="/admin/payments" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> Payments
      </Link>
      <PageHeader
        title="Stripe payments"
        description="Payments as Stripe reports them, read live, next to the olozzo order each one belongs to. Any disagreement is flagged."
      />
    </>
  );
  if (!stripeEnabled()) {
    return (
      <>
        {header}
        <Card className="p-5 text-sm text-ink-500">Stripe is not connected. Set STRIPE_SECRET_KEY first.</Card>
      </>
    );
  }

  let listed: Awaited<ReturnType<typeof listStripePayments>>;
  try {
    listed = await listStripePayments({ limit: PAGE_SIZE, startingAfter: after?.startsWith("pi_") ? after : undefined });
  } catch (err) {
    return (
      <>
        {header}
        <Card className="p-5 text-sm text-red-700">Could not reach Stripe: {errorMessage(err)}</Card>
      </>
    );
  }

  const payments = listed.page.data.map(stripePaymentOf);
  const orders = await db.order.findMany({
    where: {
      OR: [
        { paymentIntentId: { in: payments.map((p) => p.id) } },
        { id: { in: payments.map((p) => p.orderId).filter((id): id is string => Boolean(id)) } },
      ],
    },
    select: { id: true, number: true, total: true, currency: true, paymentStatus: true, paymentIntentId: true },
  });
  const byIntent = new Map(orders.filter((o) => o.paymentIntentId).map((o) => [o.paymentIntentId, o]));
  const byId = new Map(orders.map((o) => [o.id, o]));
  const rows = payments.map((p) => {
    const order = byIntent.get(p.id) ?? (p.orderId ? byId.get(p.orderId) : undefined) ?? null;
    return { p, order, check: checkStripePayment(order, p) };
  });
  const problemCount = rows.filter((r) => r.check.state === "problem").length;
  const succeeded = rows.filter((r) => r.p.status === "succeeded");
  const received = succeeded.filter((r) => r.p.currency === "EUR").reduce((sum, r) => sum + r.p.amountReceived, 0);
  const shown = problems ? rows.filter((r) => r.check.state === "problem") : rows;
  const mode = stripeMode();
  const last = payments.at(-1);
  const query = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
    return `/admin/payments/stripe${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      {header}
      {mode === "test" && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">Test mode: these are test payments, no real money.</p>
      )}
      {!listed.chargeAccess && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          The Stripe API key may not read charges, so payment methods, refunds and disputes are not shown or checked. Give the restricted key
          Charges: Read.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {[
          { label: "All", active: !problems, href: query({ after }) },
          { label: `Needs attention (${problemCount})`, active: Boolean(problems), href: query({ after, problems: "1" }) },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={cn(
              "rounded-full px-3 py-1 ring-1 ring-inset",
              f.active ? "bg-ink-900 text-white ring-ink-900" : "text-ink-600 ring-ink-200 hover:ring-ink-400",
            )}
          >
            {f.label}
          </Link>
        ))}
        <span className="ml-auto text-ink-500">
          {payments.length} payments{after ? "" : " (newest)"} · {succeeded.length} succeeded, {formatAmount(received, "EUR")} received
        </span>
      </div>

      <Card className="overflow-x-auto">
        {shown.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">{problems ? "Every payment on this page matches its order." : "No payments in Stripe yet."}</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Created</th>
                <th>Amount</th>
                <th>Stripe</th>
                <th>Method</th>
                <th>olozzo order</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, order, check }) => (
                <tr key={p.id} className={cn("align-top", check.state === "problem" && "bg-red-50/50")}>
                  <td className="whitespace-nowrap text-ink-500">{formatDateTime(p.createdAt)}</td>
                  <td className="whitespace-nowrap">
                    <span className="font-medium">{formatAmount(p.status === "succeeded" ? p.amountReceived : p.amount, p.currency)}</span>
                    {p.charge && p.charge.refunded > 0 && (
                      <span className="block text-xs text-purple-700">{formatAmount(p.charge.refunded, p.currency)} refunded</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={cn("font-medium", p.status === "succeeded" ? "text-emerald-700" : p.lastError ? "text-red-700" : "text-ink-700")}>
                      {stripeStatusLabel(p)}
                    </span>
                    {p.charge?.disputed && <span className="block text-xs font-medium text-red-700">Disputed</span>}
                    <a
                      href={stripePaymentUrl(mode, p.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-mono text-xs text-ink-400 hover:text-brand-700"
                    >
                      {p.id} <ExternalLink size={11} />
                    </a>
                  </td>
                  <td className="text-ink-600">
                    {p.charge?.method ? <span className="whitespace-nowrap">{p.charge.method}</span> : <span className="text-ink-400">—</span>}
                    {p.lastError && p.status !== "succeeded" && (
                      <span title={p.lastError} className="line-clamp-2 max-w-xs text-xs text-red-700">
                        {p.lastError}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {order ? (
                      <>
                        <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs font-semibold hover:underline">
                          {order.number}
                        </Link>
                        <StatusBadge status={order.paymentStatus} className="ml-2" />
                      </>
                    ) : (
                      <span className="text-xs text-ink-400">{p.orderNumber ?? "none"}</span>
                    )}
                  </td>
                  <td className="min-w-56">
                    <CheckResult check={check} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-4 flex justify-between text-sm">
        {after ? (
          <Link href={query({ problems })} className="font-medium text-brand-700 hover:underline">
            ← Newest payments
          </Link>
        ) : (
          <span />
        )}
        {listed.page.has_more && last && (
          <Link href={query({ after: last.id, problems })} className="font-medium text-brand-700 hover:underline">
            Older payments →
          </Link>
        )}
      </div>
    </>
  );
}
