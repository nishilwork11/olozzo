import Link from "next/link";
import { AlertTriangle, Boxes, Euro, PackageCheck, Truck } from "lucide-react";
import { BarChart, Card, CardHeader, Flash, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { countryName } from "@/lib/eu";
import { formatMoney } from "@/lib/money";
import { requireSupplier } from "@/lib/supplier";
import { formatDate, lastDays } from "@/lib/utils";

export default async function SupplierHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const { supplier } = await requireSupplier();
  const since30 = new Date(Date.now() - 30 * 86400000);
  const since14 = new Date();
  since14.setDate(since14.getDate() - 13);
  since14.setHours(0, 0, 0, 0);

  const [activeProducts, open, shipped30, earnings, lowStock, recent, chart, storesSelling] = await Promise.all([
    db.product.count({ where: { supplierId: supplier.id, active: true } }),
    db.supplierOrder.count({ where: { supplierId: supplier.id, status: { in: ["PENDING", "ACCEPTED"] } } }),
    db.supplierOrder.count({ where: { supplierId: supplier.id, shippedAt: { gte: since30 } } }),
    db.supplierOrder.aggregate({
      where: { supplierId: supplier.id, status: { not: "CANCELLED" }, createdAt: { gte: since30 } },
      _sum: { itemsCost: true, shippingCost: true },
    }),
    db.productVariant.findMany({
      where: { product: { supplierId: supplier.id, active: true }, stock: { lte: 10 } },
      include: { product: true },
      orderBy: { stock: "asc" },
      take: 6,
    }),
    db.supplierOrder.findMany({ where: { supplierId: supplier.id }, include: { order: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.supplierOrder.findMany({
      where: { supplierId: supplier.id, status: { not: "CANCELLED" }, createdAt: { gte: since14 } },
      select: { itemsCost: true, shippingCost: true, createdAt: true },
    }),
    db.storeProduct.findMany({ where: { product: { supplierId: supplier.id } }, select: { storeId: true }, distinct: ["storeId"] }),
  ]);

  const revenue = (earnings._sum.itemsCost ?? 0) + (earnings._sum.shippingCost ?? 0);
  const byDay = new Map(lastDays(14).map((d) => [d, 0]));
  for (const f of chart) {
    const key = f.createdAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, byDay.get(key)! + f.itemsCost + f.shippingCost);
  }

  return (
    <>
      <PageHeader title={supplier.companyName} description={`Ships from ${countryName(supplier.country)} · ${supplier.processingDays}-day processing · sold by ${storesSelling.length} store${storesSelling.length === 1 ? "" : "s"}`} actions={<StatusBadge status={supplier.status} />} />
      <Flash {...flash} />

      {open > 0 && (
        <Link href="/supplier/orders" className="mb-6 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 hover:bg-sky-100">
          <span className="flex items-center gap-2">
            <Truck size={18} /> <b>{open}</b> order{open > 1 ? "s" : ""} waiting to be shipped
          </span>
          <span className="font-semibold">Open queue →</span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Wholesale revenue (30d)" value={formatMoney(revenue)} hint="Item cost + shipping fees" icon={Euro} />
        <StatCard label="Open fulfilments" value={open} icon={Truck} />
        <StatCard label="Shipped (30d)" value={shipped30} icon={PackageCheck} />
        <StatCard label="Active products" value={activeProducts} icon={Boxes} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Wholesale revenue — last 14 days" />
          <div className="p-5">
            <BarChart data={[...byDay].map(([d, v]) => ({ label: d.slice(5), value: v }))} format={formatMoney} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Low stock" action={<Link href="/supplier/products" className="text-sm font-medium text-brand-700 hover:underline">Manage</Link>} />
          {lowStock.length === 0 ? (
            <p className="p-5 text-sm text-ink-500">All variants have healthy stock levels.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {lowStock.map((v) => (
                <li key={v.id}>
                  <Link href={`/supplier/products/${v.productId}`} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-ink-50">
                    <span className="min-w-0 truncate">
                      {v.product.title} {v.name !== "Default" && <span className="text-ink-500">· {v.name}</span>}
                    </span>
                    <span className={`flex shrink-0 items-center gap-1 font-semibold ${v.stock === 0 ? "text-red-600" : "text-amber-600"}`}>
                      {v.stock === 0 && <AlertTriangle size={13} />} {v.stock}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Latest orders" action={<Link href="/supplier/orders" className="text-sm font-medium text-brand-700 hover:underline">View queue</Link>} />
        {recent.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">No orders yet. Once merchants sell your products, paid orders land here automatically.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {recent.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{f.order.number}</p>
                  <p className="text-xs text-ink-500">
                    {f.order.city}, {countryName(f.order.country)} · {formatDate(f.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={f.status} />
                  <span className="w-20 text-right text-sm font-semibold">{formatMoney(f.itemsCost + f.shippingCost)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
