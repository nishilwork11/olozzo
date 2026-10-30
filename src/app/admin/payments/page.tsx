import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Receipt, ScrollText } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { LOG_LEVEL_TEXT } from "@/components/orders/PaymentPanel";
import { Card, CardHeader, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { paymentSetup } from "@/lib/payments";
import { PAYMENT_EVENT_LABELS } from "@/lib/payments/log-details";
import { STRIPE_WEBHOOK_EVENTS } from "@/lib/payments/stripe-events";
import { cn, formatDateTime } from "@/lib/utils";
import { adminReconcilePayments } from "../actions";

export const metadata: Metadata = { title: "Payments · Admin" };

type CheckState = "ok" | "warn" | "todo";

function Check({ state, title, children }: { state: CheckState; title: string; children?: React.ReactNode }) {
  const Icon = state === "ok" ? CheckCircle2 : state === "warn" ? AlertTriangle : CircleDashed;
  return (
    <li className="flex gap-3 py-3">
      <Icon
        size={18}
        className={cn("mt-0.5 shrink-0", state === "ok" ? "text-emerald-600" : state === "warn" ? "text-red-600" : "text-amber-500")}
        aria-hidden="true"
      />
      <div className="text-sm">
        <p className="font-medium text-ink-900">{title}</p>
        {children && <div className="mt-0.5 text-ink-500">{children}</div>}
      </div>
    </li>
  );
}

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const setup = paymentSetup();
  const staleBefore = new Date(Date.now() - 2 * 3600_000);
  const slowBefore = new Date(Date.now() - 7 * 86400_000);

  const [review, pending, staleUnpaid, events, oversold, problems] = await Promise.all([
    db.order.findMany({
      where: { paymentFailureReason: { startsWith: "Needs review" }, paymentStatus: { not: "PAID" } },
      include: { store: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.order.findMany({ where: { paymentStatus: "PENDING" }, include: { store: true }, orderBy: { createdAt: "asc" }, take: 20 }),
    db.order.count({ where: { paymentStatus: "UNPAID", status: "PENDING", createdAt: { lt: staleBefore } } }),
    db.stripeEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.auditLog.findMany({ where: { action: "order.oversold" }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.paymentLog.findMany({
      where: { level: { in: ["WARN", "ERROR"] }, createdAt: { gt: slowBefore } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const eventOrders = await db.order.findMany({
    where: { id: { in: [...events, ...problems].map((e) => e.orderId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, number: true },
  });
  const orderNumber = new Map(eventOrders.map((o) => [o.id, o.number]));
  const webhookUrl = `${setup.appUrl ?? "https://<your-domain>"}/api/webhooks/stripe`;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Stripe setup, payments that need attention and the latest webhook events. Stripe payments compares every payment in Stripe with its order."
        actions={
          <>
            {setup.stripe && (
              <Link href="/admin/payments/stripe" className="btn btn-secondary">
                <Receipt size={14} /> Stripe payments
              </Link>
            )}
            <Link href="/admin/payments/log" className="btn btn-secondary">
              <ScrollText size={14} /> Payment log
            </Link>
          </>
        }
      />
      <Flash {...flash} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Setup checklist" />
            <ul className="divide-y divide-ink-100 px-5">
              <Check state={setup.stripe ? "ok" : "todo"} title={setup.stripe ? `Stripe is connected (${setup.stripeMode ?? "unknown"} mode)` : "Stripe is not connected"}>
                {setup.stripe ? (
                  setup.stripeMode === "test" ? (
                    "Test mode: use Stripe's test cards. No real money moves."
                  ) : (
                    "Live mode: customers are charged for real."
                  )
                ) : (
                  <>Set <code>STRIPE_SECRET_KEY</code> in the server environment, then restart.</>
                )}
              </Check>
              {setup.stripe && (
                <Check state={setup.stripeRestrictedKey ? "ok" : "todo"} title={setup.stripeRestrictedKey ? "Using a restricted API key" : "Using a full secret key"}>
                  {!setup.stripeRestrictedKey &&
                    "Recommended: a restricted key with write access to Checkout Sessions and Refunds, and read access to PaymentIntents, Charges and Events, limits the damage if the key leaks."}
                </Check>
              )}
              {setup.stripe && (
                <Check state={setup.stripeWebhookSecret ? "ok" : "warn"} title={setup.stripeWebhookSecret ? "Webhook signing secret is set" : "Webhook signing secret is missing"}>
                  {!setup.stripeWebhookSecret && (
                    <>
                      Without <code>STRIPE_WEBHOOK_SECRET</code>, orders are confirmed only when the customer returns to the shop, and bank payments (SEPA)
                      never complete. Register the webhook below.
                    </>
                  )}
                </Check>
              )}
              {setup.stripe && (
                <Check
                  state={setup.cronSecret ? "ok" : "todo"}
                  title={setup.cronSecret ? "Automatic payment check is enabled" : "Automatic payment check is not enabled"}
                >
                  {setup.cronSecret ? (
                    <>
                      Make sure a scheduler calls <code>GET /api/cron/payments</code> every 15 minutes with <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code>.
                    </>
                  ) : (
                    <>
                      Set <code>CRON_SECRET</code> and call <code>GET /api/cron/payments</code> every 15 minutes. It confirms payments whose webhook
                      never arrived, e.g. when the customer closed the browser before returning to the shop.
                    </>
                  )}
                </Check>
              )}
              <Check state={setup.demo ? "warn" : "ok"} title={setup.demo ? "Demo payments are switched on" : "Demo payments are off"}>
                {setup.demo
                  ? "Shoppers can place paid orders without paying. This is only allowed outside production builds."
                  : "Demo payments are always off in production builds and next to a live Stripe key."}
              </Check>
              <Check state={setup.appUrl?.startsWith("https://") ? "ok" : "todo"} title={`Public URL: ${setup.appUrl ?? "not set"}`}>
                {!setup.appUrl?.startsWith("https://") && (
                  <>
                    Set <code>NEXT_PUBLIC_APP_URL</code> to the https address of the shop. Stripe sends customers back there after paying.
                  </>
                )}
              </Check>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Stripe webhook" />
            <div className="space-y-3 p-5 text-sm">
              <p className="text-ink-600">In the Stripe Dashboard, open Workbench → Webhooks and add an endpoint with this URL and these events:</p>
              <p className="break-all rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs">{webhookUrl}</p>
              <ul className="flex flex-wrap gap-1.5">
                {STRIPE_WEBHOOK_EVENTS.map((e) => (
                  <li key={e} className="rounded-md bg-ink-100 px-2 py-0.5 font-mono text-xs text-ink-700">
                    {e}
                  </li>
                ))}
              </ul>
              <p className="text-ink-500">
                Use API version <code>2026-09-30.endive</code>. Copy the endpoint&apos;s signing secret (<code>whsec_…</code>) into{" "}
                <code>STRIPE_WEBHOOK_SECRET</code>. Test and live mode each have their own endpoint and secret.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Latest Stripe events" />
            {events.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">No webhook events received yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-ink-800">{e.type}</p>
                      {e.summary && <p className="truncate text-xs text-ink-500">{e.summary}</p>}
                    </div>
                    <div className="shrink-0 text-right text-xs text-ink-500">
                      {e.orderId ? (
                        <Link href={`/admin/orders/${e.orderId}`} className="font-mono font-semibold text-ink-800 hover:underline">
                          {orderNumber.get(e.orderId) ?? "Order"}
                        </Link>
                      ) : (
                        <span>no order</span>
                      )}
                      <p>{formatDateTime(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Payment problems (7 days)"
              action={
                <Link href="/admin/payments/log?level=problems" className="text-sm font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              }
            />
            {problems.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">No failed, declined or refused payments.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {problems.map((p) => (
                  <li key={p.id} className="px-5 py-3 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("font-medium", LOG_LEVEL_TEXT[p.level])}>{PAYMENT_EVENT_LABELS[p.event] ?? p.event}</span>
                      {p.orderId && (
                        <Link href={`/admin/orders/${p.orderId}`} className="shrink-0 font-mono text-xs font-semibold hover:underline">
                          {orderNumber.get(p.orderId) ?? "Order"}
                        </Link>
                      )}
                    </div>
                    <p className="text-xs text-ink-600">{p.message}</p>
                    <p className="text-xs text-ink-400">{formatDateTime(p.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Needs review" action={<span className="text-sm text-ink-500">{review.length}</span>} />
            {review.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">No payments to review.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {review.map((o) => (
                  <li key={o.id} className="px-5 py-3 text-sm">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold hover:underline">
                      {o.number}
                    </Link>
                    <p className="text-xs text-red-700">{o.paymentFailureReason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Bank payments in progress" action={<span className="text-sm text-ink-500">{pending.length}</span>} />
            {pending.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">None right now.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {pending.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold hover:underline">
                        {o.number}
                      </Link>
                      <p className="text-xs text-ink-500">since {formatDateTime(o.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatMoney(o.total)}</p>
                      {o.createdAt < slowBefore ? (
                        <p className="mt-0.5 text-xs font-semibold text-red-700">Over 7 days</p>
                      ) : (
                        <StatusBadge status="PENDING" className="mt-0.5" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pending.some((o) => o.createdAt < slowBefore) && (
              <p className="border-t border-ink-100 px-5 py-3 text-xs text-red-700">
                Over 7 days is unusually slow. Open the order and use “Check with Stripe”.
              </p>
            )}
          </Card>

          <Card className="p-5 text-sm">
            <p className="font-semibold">Unpaid checkouts older than 2 hours</p>
            <p className="mt-1 text-2xl font-bold">{staleUnpaid}</p>
            <p className="mt-1 text-xs text-ink-500">
              Payment pages expire after 60 minutes. A count that keeps growing usually means the Stripe webhook isn&apos;t reaching the shop.
            </p>
            {setup.stripe && (
              <form action={adminReconcilePayments} className="mt-3">
                <SubmitButton className="btn btn-secondary btn-sm">Check open payments with Stripe</SubmitButton>
              </form>
            )}
          </Card>

          <Card>
            <CardHeader title="Oversold at payment" />
            {oversold.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">None. Stock was always available when payments arrived.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {oversold.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    {a.entityId && (
                      <Link href={`/admin/orders/${a.entityId}`} className="font-semibold hover:underline">
                        View order
                      </Link>
                    )}
                    <p className="text-xs text-ink-500">{a.details}</p>
                    <p className="text-xs text-ink-400">{formatDateTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
