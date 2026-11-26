import type { Metadata } from "next";
import Link from "next/link";
import { Euro, Factory, Receipt, Store, TrendingUp, Users } from "lucide-react";
import { BarChart, Card, CardHeader, Flash, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { paymentSetup } from "@/lib/payments";
import { formatDate, lastDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview · Admin" };

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [paidAgg, fees, userCount, storeCount, supplierCounts, recent, chartOrders, openReturns] = await Promise.all([
    db.order.aggregate({ where: { paymentStatus: "PAID" }, _sum: { total: true }, _count: true }),
    db.order.aggregate({ where: { paymentStatus: "PAID" }, _sum: { platformFee: true } }),
    db.user.count(),
    db.store.count(),
    db.supplier.groupBy({ by: ["status"], _count: true }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { store: true } }),
    db.order.findMany({ where: { paymentStatus: "PAID", createdAt: { gte: since } }, select: { total: true, createdAt: true } }),
    db.returnRequest.count({ where: { status: "REQUESTED" } }),
  ]);

  const setup = paymentSetup();
  const paymentsToReview = await db.order.count({
    where: { paymentFailureReason: { startsWith: "Needs review" }, paymentStatus: { not: "PAID" } },
  });
  const paymentAlerts = [
    setup.demo && "demo payments are on",
    setup.stripe && !setup.stripeWebhookSecret && "the Stripe webhook secret is missing",
    !setup.stripe && !setup.mollie && "no payment provider is connected",
    paymentsToReview > 0 && `${paymentsToReview} payment${paymentsToReview > 1 ? "s" : ""} need${paymentsToReview > 1 ? "" : "s"} review`,
  ].filter((a): a is string => Boolean(a));

  const pendingSuppliers = supplierCounts.find((s) => s.status === "PENDING")?._count ?? 0;
  const approvedSuppliers = supplierCounts.find((s) => s.status === "APPROVED")?._count ?? 0;
  const byDay = new Map(lastDays(14).map((d) => [d, 0]));
  for (const o of chartOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, byDay.get(key)! + o.total);
  }

  return (
    <>
      <PageHeader title="Platform overview" description="Gross merchandise volume, fees and activity across all olozzo stores." />
      <Flash {...flash} />

      {paymentAlerts.length > 0 && (
        <Link href="/admin/payments" className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 hover:bg-red-100">
          <span>
            <b>Payments:</b> {paymentAlerts.join(" · ")}
          </span>
          <span className="font-semibold">Open payments →</span>
        </Link>
      )}

      {pendingSuppliers > 0 && (
        <Link href="/admin/suppliers" className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span>
            <b>{pendingSuppliers}</b> supplier application{pendingSuppliers > 1 ? "s" : ""} waiting for review
          </span>
          <span className="font-semibold">Review →</span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Gross merchandise volume" value={formatMoney(paidAgg._sum.total ?? 0)} hint={`${paidAgg._count} paid orders`} icon={Euro} />
        <StatCard label="Platform fee revenue" value={formatMoney(fees._sum.platformFee ?? 0)} hint="Transaction fees from paid orders" icon={TrendingUp} />
        <StatCard label="Open return requests" value={openReturns} hint="Handled by merchants" icon={Receipt} />
        <StatCard label="Stores" value={storeCount} icon={Store} />
        <StatCard label="Approved suppliers" value={approvedSuppliers} hint={`${pendingSuppliers} pending`} icon={Factory} />
        <StatCard label="Users" value={userCount} icon={Users} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="GMV — last 14 days" />
          <div className="p-5">
            <BarChart data={[...byDay].map(([d, v]) => ({ label: d.slice(5), value: v }))} format={formatMoney} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Latest orders" action={<Link href="/admin/orders" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
          <ul className="divide-y divide-ink-100">
            {recent.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-ink-50">
                  <div>
                    <p className="font-mono text-sm font-semibold">{o.number}</p>
                    <p className="text-xs text-ink-500">
                      {o.store.name} · {formatDate(o.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatMoney(o.total)}</p>
                    <StatusBadge status={o.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
