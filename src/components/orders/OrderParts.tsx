import { Check, ExternalLink, Package } from "lucide-react";
import type { Order, OrderItem, Supplier, SupplierOrder } from "@prisma/client";
import { countryName } from "@/lib/eu";
import { formatMoney } from "@/lib/money";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { ProductThumb, StatusBadge } from "@/components/ui";

export function OrderItemsList({ items, showCost = false }: { items: OrderItem[]; showCost?: boolean }) {
  return (
    <ul className="divide-y divide-ink-100">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-4 py-3">
          <ProductThumb src={item.image} alt={item.title} className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.title}</p>
            <p className="text-sm text-ink-500">
              {item.variantName !== "Default" && `${item.variantName} · `}Qty {item.quantity} × {formatMoney(item.unitPrice)}
              {showCost && <span className="ml-2 text-xs text-ink-400">(cost {formatMoney(item.unitCost)})</span>}
            </p>
          </div>
          <p className="font-medium">{formatMoney(item.unitPrice * item.quantity)}</p>
        </li>
      ))}
    </ul>
  );
}

export function OrderTotals({ order, showProfit = false }: { order: Order; showProfit?: boolean }) {
  const net = order.total - order.vatTotal;
  const profit = net - order.costTotal - order.platformFee;
  const refunded = order.paymentStatus === "REFUNDED";
  return (
    <dl className="space-y-1.5 text-sm">
      <Row label="Subtotal" value={formatMoney(order.subtotal)} />
      {order.discountTotal > 0 && <Row label={`Discount (${order.discountCode})`} value={`−${formatMoney(order.discountTotal)}`} className="text-emerald-700" />}
      <Row label="Shipping" value={order.shippingTotal === 0 ? "Free" : formatMoney(order.shippingTotal)} />
      <Row label="Total" value={formatMoney(order.total)} className="border-t border-ink-100 pt-2 text-base font-semibold text-ink-900" />
      <Row label={`incl. VAT ${Number((order.vatRate * 100).toFixed(1))}% (${order.country})`} value={formatMoney(order.vatTotal)} className="text-xs text-ink-500" />
      {showProfit && (
        <div className="mt-3 space-y-1.5 rounded-xl bg-ink-50 p-3">
          <Row label="Net revenue (excl. VAT)" value={formatMoney(net)} />
          <Row label="Supplier cost incl. shipping" value={`−${formatMoney(order.costTotal)}`} />
          <Row label="olozzo transaction fee" value={`−${formatMoney(order.platformFee)}`} />
          <Row
            label={refunded ? "Profit (refunded)" : "Profit"}
            value={refunded ? formatMoney(0) : formatMoney(profit)}
            className={cn("border-t border-ink-200 pt-1.5 font-semibold", profit >= 0 ? "text-emerald-700" : "text-red-600")}
          />
        </div>
      )}
    </dl>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-4", className)}>
      <dt className={cn(!className && "text-ink-500")}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AddressBlock({ order }: { order: Order }) {
  return (
    <address className="text-sm not-italic leading-relaxed text-ink-700">
      <span className="font-medium text-ink-900">{order.name}</span>
      <br />
      {order.addressLine1}
      {order.addressLine2 && (
        <>
          <br />
          {order.addressLine2}
        </>
      )}
      <br />
      {order.postalCode} {order.city}
      <br />
      {countryName(order.country)}
      {order.phone && (
        <>
          <br />
          {order.phone}
        </>
      )}
      <br />
      <span className="text-ink-500">{order.email}</span>
    </address>
  );
}

const STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "paid", label: "Payment confirmed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

export function OrderTimeline({ order }: { order: Order }) {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <StatusBadge status={order.status} /> <span className="text-ink-500">This order was {order.status.toLowerCase()}.</span>
      </div>
    );
  }
  const reached =
    order.status === "DELIVERED" ? 4 : order.status === "SHIPPED" ? 3 : order.paymentStatus === "PAID" ? 2 : 1;
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const done = i < reached;
        return (
          <li key={s.key} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i < reached ? "bg-[var(--accent,#059669)]" : "bg-ink-200")} />
              <span
                className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-white", done ? "" : "bg-ink-200 text-ink-500")}
                style={done ? { background: "var(--accent, #059669)" } : undefined}
              >
                {done ? <Check size={16} /> : i + 1}
              </span>
              <div className={cn("h-0.5 flex-1", i === STEPS.length - 1 ? "bg-transparent" : i < reached - 1 ? "bg-[var(--accent,#059669)]" : "bg-ink-200")} />
            </div>
            <span className={cn("mt-2 text-xs", done ? "font-medium text-ink-900" : "text-ink-400")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ShipmentList({
  fulfillments,
  showSupplier = false,
}: {
  fulfillments: (SupplierOrder & { supplier?: Supplier; items?: OrderItem[] })[];
  showSupplier?: boolean;
}) {
  if (fulfillments.length === 0) return <p className="text-sm text-ink-500">Shipments appear here once payment is confirmed.</p>;
  return (
    <ul className="space-y-3">
      {fulfillments.map((f, i) => (
        <li key={f.id} className="rounded-xl border border-ink-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium">
              <Package size={16} className="text-ink-400" />
              Shipment {i + 1}
              {showSupplier && f.supplier && <span className="font-normal text-ink-500">· {f.supplier.companyName}</span>}
            </p>
            <StatusBadge status={f.status} />
          </div>
          {f.items && f.items.length > 0 && (
            <p className="mt-1 text-sm text-ink-500">{f.items.map((it) => `${it.quantity}× ${it.title}`).join(", ")}</p>
          )}
          {f.trackingNumber ? (
            <p className="mt-2 text-sm">
              {f.carrier} ·{" "}
              {f.trackingUrl ? (
                <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono font-medium underline">
                  {f.trackingNumber} <ExternalLink size={12} />
                </a>
              ) : (
                <span className="font-mono">{f.trackingNumber}</span>
              )}
              {f.shippedAt && <span className="text-ink-500"> · shipped {formatDate(f.shippedAt)}</span>}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-500">Preparing for dispatch</p>
          )}
          {f.deliveredAt && <p className="text-xs text-ink-500">Delivered {formatDateTime(f.deliveredAt)}</p>}
        </li>
      ))}
    </ul>
  );
}
