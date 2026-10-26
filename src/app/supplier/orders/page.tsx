import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, PackageOpen } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, EmptyState, Flash, PageHeader, ProductThumb, StatusBadge } from "@/components/ui";
import { CARRIERS } from "@/lib/carriers";
import { db } from "@/lib/db";
import { countryName } from "@/lib/eu";
import { formatMoney } from "@/lib/money";
import { requireSupplier } from "@/lib/supplier";
import { cn, formatDateTime } from "@/lib/utils";
import { acceptFulfillment, markDelivered, shipFulfillment } from "../actions";

const TABS = [
  { key: "open", label: "To ship", statuses: ["PENDING", "ACCEPTED"] },
  { key: "SHIPPED", label: "Shipped", statuses: ["SHIPPED"] },
  { key: "DELIVERED", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "CANCELLED", label: "Cancelled", statuses: ["CANCELLED"] },
];

export const metadata: Metadata = { title: "Fulfilment queue · Supplier" };

export default async function SupplierOrders({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  const { status, ...flash } = await searchParams;
  const { supplier } = await requireSupplier();
  const tab = TABS.find((t) => t.key === status) ?? TABS[0];

  const [fulfillments, grouped] = await Promise.all([
    db.supplierOrder.findMany({
      where: { supplierId: supplier.id, status: { in: tab.statuses } },
      include: { order: { include: { store: true } }, items: { include: { variant: true } } },
      orderBy: { createdAt: tab.key === "open" ? "asc" : "desc" },
      take: 100,
    }),
    db.supplierOrder.groupBy({ by: ["status"], where: { supplierId: supplier.id }, _count: true }),
  ]);
  const count = (statuses: readonly string[]) => grouped.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + g._count, 0);

  return (
    <>
      <PageHeader
        title="Fulfilment queue"
        description="Paid orders routed to you. Ship directly to the customer in neutral packaging (blind dropshipping) and add the tracking number."
      />
      <Flash {...flash} />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-ink-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/supplier/orders?status=${t.key}`}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium", tab.key === t.key ? "border-ink-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800")}
          >
            {t.label} <span className="ml-1 rounded-full bg-ink-100 px-1.5 text-xs">{count(t.statuses)}</span>
          </Link>
        ))}
      </div>

      {fulfillments.length === 0 ? (
        <Card>
          <EmptyState icon={PackageOpen} title={tab.key === "open" ? "Nothing to ship right now" : "No orders in this tab"} description="New paid orders appear here automatically." />
        </Card>
      ) : (
        <div className="space-y-4">
          {fulfillments.map((f) => {
            const o = f.order;
            return (
              <Card key={f.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold">{o.number}</span>
                    <StatusBadge status={f.status} />
                    <span className="text-xs text-ink-500">{formatDateTime(f.createdAt)}</span>
                  </div>
                  <div className="text-sm">
                    You receive <b>{formatMoney(f.itemsCost + f.shippingCost)}</b>
                    <span className="text-ink-500"> ({formatMoney(f.itemsCost)} items + {formatMoney(f.shippingCost)} shipping)</span>
                  </div>
                </div>
                <div className="grid gap-6 p-5 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Pick list</p>
                    <ul className="space-y-2">
                      {f.items.map((it) => (
                        <li key={it.id} className="flex items-center gap-3">
                          <ProductThumb src={it.image} alt={it.title} className="h-12 w-12 shrink-0" />
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="font-medium">
                              {it.quantity}× {it.title}
                            </p>
                            <p className="text-xs text-ink-500">
                              {it.variantName !== "Default" && `${it.variantName} · `}SKU {it.variant?.sku ?? "—"}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-xs text-ink-500">
                      Packing slip brand: <b>{o.store.name}</b> — do not include invoices or supplier branding.
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Ship to</p>
                    <address className="text-sm not-italic leading-relaxed">
                      <b>{o.name}</b>
                      <br />
                      {o.addressLine1}
                      {o.addressLine2 && (
                        <>
                          <br />
                          {o.addressLine2}
                        </>
                      )}
                      <br />
                      {o.postalCode} {o.city}
                      <br />
                      {countryName(o.country).toUpperCase()}
                      {o.phone && (
                        <>
                          <br />
                          Tel. {o.phone}
                        </>
                      )}
                    </address>
                  </div>
                </div>

                <div className="border-t border-ink-100 px-5 py-4">
                  {f.status === "PENDING" && (
                    <form action={acceptFulfillment.bind(null, f.id)} className="flex items-center justify-between gap-3">
                      <p className="text-sm text-ink-500">Confirm you have stock and will ship within {supplier.processingDays} day(s).</p>
                      <SubmitButton className="btn btn-dark">Accept order</SubmitButton>
                    </form>
                  )}
                  {(f.status === "PENDING" || f.status === "ACCEPTED") && (
                    <form action={shipFulfillment.bind(null, f.id)} className={cn("grid gap-2 sm:grid-cols-[160px_1fr_1fr_auto]", f.status === "PENDING" && "mt-3")}>
                      <select name="carrier" required defaultValue="" className="input">
                        <option value="" disabled>Carrier</option>
                        {CARRIERS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input name="trackingNumber" required placeholder="Tracking number" className="input font-mono" />
                      <input name="trackingUrl" type="url" placeholder="Tracking URL (optional)" className="input" />
                      <SubmitButton className="btn btn-primary">Mark shipped</SubmitButton>
                    </form>
                  )}
                  {f.status === "SHIPPED" && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <p>
                        {f.carrier} ·{" "}
                        {f.trackingUrl ? (
                          <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono underline">
                            {f.trackingNumber} <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="font-mono">{f.trackingNumber}</span>
                        )}
                      </p>
                      <form action={markDelivered.bind(null, f.id)}>
                        <SubmitButton className="btn btn-secondary btn-sm">Mark delivered</SubmitButton>
                      </form>
                    </div>
                  )}
                  {f.status === "DELIVERED" && (
                    <p className="text-sm text-ink-500">
                      Delivered {f.deliveredAt ? formatDateTime(f.deliveredAt) : ""} · {f.carrier} {f.trackingNumber}
                    </p>
                  )}
                  {f.status === "CANCELLED" && <p className="text-sm text-ink-500">Cancelled by the merchant (refunded before dispatch) — do not ship.</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
