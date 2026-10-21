import Link from "next/link";
import { CheckCircle2, Circle, Euro, Package, Receipt, RotateCcw, ShoppingBag, TrendingUp } from "lucide-react";
import { BarChart, Card, CardHeader, Flash, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { requireMerchantStore } from "@/lib/merchant";
import { formatMoney } from "@/lib/money";
import { paymentOptions } from "@/lib/payments";
import { planFor } from "@/lib/plans";
import { formatDate, lastDays } from "@/lib/utils";

export default async function MerchantHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const { user, store } = await requireMerchantStore();
  const since30 = new Date(Date.now() - 30 * 86400000);
  const since14 = new Date();
  since14.setDate(since14.getDate() - 13);
  since14.setHours(0, 0, 0, 0);

  const [paid30, productCount, discountCount, recent, chartOrders, openReturns, toShip] = await Promise.all([
    db.order.findMany({
      where: { storeId: store.id, paymentStatus: "PAID", createdAt: { gte: since30 } },
      select: { total: true, vatTotal: true, costTotal: true, platformFee: true },
    }),
    db.storeProduct.count({ where: { storeId: store.id } }),
    db.discountCode.count({ where: { storeId: store.id } }),
    db.order.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.order.findMany({ where: { storeId: store.id, paymentStatus: "PAID", createdAt: { gte: since14 } }, select: { total: true, createdAt: true } }),
    db.returnRequest.count({ where: { status: "REQUESTED", order: { storeId: store.id } } }),
    db.order.count({ where: { storeId: store.id, status: "PROCESSING" } }),
  ]);

  const revenue = paid30.reduce((s, o) => s + o.total, 0);
  const profit = paid30.reduce((s, o) => s + (o.total - o.vatTotal - o.costTotal - o.platformFee), 0);
  const aov = paid30.length ? Math.round(revenue / paid30.length) : 0;
  const byDay = new Map(lastDays(14).map((d) => [d, 0]));
  for (const o of chartOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, byDay.get(key)! + o.total);
  }

  const payments = paymentOptions().filter((p) => p.id !== "demo");
  const checklist = [
    { done: true, label: "Create your store", href: "/merchant/settings" },
    { done: productCount >= 5, label: `Import at least 5 products (${productCount}/5)`, href: "/merchant/catalog" },
    { done: Boolean(store.logoUrl || store.bannerUrl), label: "Add your logo or banner", href: "/merchant/settings" },
    { done: discountCount > 0, label: "Create a welcome discount code", href: "/merchant/discounts" },
    { done: payments.length > 0, label: "Connect Stripe or Mollie (platform .env)", href: "/merchant/settings#payments" },
  ];

  return (
    <>
      <PageHeader
        title={`Good to see you, ${user.name.split(" ")[0]}`}
        description={
          <>
            Here&apos;s how <b>{store.name}</b> is doing over the last 30 days · {planFor(store.plan).name} plan
          </>
        }
        actions={
          <Link href={`/s/${store.slug}`} target="_blank" className="btn btn-secondary">
            <ShoppingBag size={16} /> View store
          </Link>
        }
      />
      <Flash {...flash} />

      {(openReturns > 0 || toShip > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {toShip > 0 && (
            <Link href="/merchant/orders?status=PROCESSING" className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 hover:bg-sky-100">
              <Package size={18} /> <span><b>{toShip}</b> order{toShip > 1 ? "s" : ""} being fulfilled by suppliers</span>
            </Link>
          )}
          {openReturns > 0 && (
            <Link href="/merchant/orders" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
              <RotateCcw size={18} /> <span><b>{openReturns}</b> return request{openReturns > 1 ? "s" : ""} need your decision</span>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (30d)" value={formatMoney(revenue)} hint="Incl. VAT" icon={Euro} />
        <StatCard label="Profit (30d)" value={formatMoney(profit)} hint="After VAT, supplier cost & fees" icon={TrendingUp} />
        <StatCard label="Orders (30d)" value={paid30.length} hint={`Avg. order ${formatMoney(aov)}`} icon={Receipt} />
        <StatCard label="Products in store" value={productCount} icon={Package} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Sales — last 14 days" />
          <div className="p-5">
            <BarChart data={[...byDay].map(([d, v]) => ({ label: d.slice(5), value: v }))} format={formatMoney} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Setup guide" />
          <ul className="space-y-1 p-3">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-ink-50">
                  {c.done ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Circle size={18} className="text-ink-300" />}
                  <span className={c.done ? "text-ink-500 line-through" : "font-medium"}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent orders" action={<Link href="/merchant/orders" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
        {recent.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">No orders yet — share your store link to get your first sale.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {recent.map((o) => (
              <li key={o.id}>
                <Link href={`/merchant/orders/${o.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-ink-50">
                  <div>
                    <p className="font-mono text-sm font-semibold">{o.number}</p>
                    <p className="text-xs text-ink-500">
                      {o.name} · {formatDate(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={o.status} />
                    <span className="w-24 text-right text-sm font-semibold">{formatMoney(o.total)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
