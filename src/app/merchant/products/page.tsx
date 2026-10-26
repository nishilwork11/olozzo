import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Pencil, Star, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, EmptyState, Flash, PageHeader, ProductThumb, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { requireMerchantStore } from "@/lib/merchant";
import { formatMoney } from "@/lib/money";
import { vatRateFor } from "@/lib/eu";
import { marginRate } from "@/lib/pricing";
import { parseImages } from "@/lib/utils";
import { removeStoreProduct, toggleStoreProduct } from "../actions";

export const metadata: Metadata = { title: "My products · Merchant" };

export default async function MerchantProducts({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const { store } = await requireMerchantStore();
  const products = await db.storeProduct.findMany({
    where: { storeId: store.id },
    include: { product: { include: { supplier: true, variants: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="My products"
        description="Products imported from suppliers into your store. Set your own titles, prices and visibility."
        actions={<Link href="/merchant/catalog" className="btn btn-primary">Find more products</Link>}
      />
      <Flash {...flash} />
      {products.length === 0 ? (
        <Card>
          <EmptyState
            icon={Boxes}
            title="Your store has no products yet"
            description="Browse the supplier catalog and import products in one click."
            action={<Link href="/merchant/catalog" className="btn btn-primary">Browse catalog</Link>}
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>Supplier</th>
                <th className="text-right">Price</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Stock</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((sp) => {
                const stock = sp.product.variants.reduce((s, v) => s + v.stock, 0);
                const unavailable = !sp.product.active || sp.product.supplier.status !== "APPROVED";
                const margin = marginRate(sp.price, sp.product.costPrice + sp.product.shippingCost, vatRateFor(store.country));
                return (
                  <tr key={sp.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <ProductThumb src={parseImages(sp.product.images)[0]} alt={sp.title} className="h-11 w-11 shrink-0" />
                        <div>
                          <Link href={`/merchant/products/${sp.id}`} className="flex items-center gap-1 font-medium hover:underline">
                            {sp.title} {sp.featured && <Star size={13} className="fill-amber-400 text-amber-400" />}
                          </Link>
                          <p className="text-xs text-ink-500">/{sp.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-ink-600">{sp.product.supplier.companyName}</td>
                    <td className="text-right font-medium">{formatMoney(sp.price)}</td>
                    <td className="text-right text-ink-500">{formatMoney(sp.product.costPrice)}</td>
                    <td className={`text-right font-medium ${margin > 0.3 ? "text-emerald-700" : margin > 0 ? "text-amber-600" : "text-red-600"}`}>
                      {(margin * 100).toFixed(0)}%
                    </td>
                    <td className={`text-right ${stock === 0 ? "text-red-600" : ""}`}>{stock}</td>
                    <td>
                      {unavailable ? (
                        <span title="The supplier removed this product or is no longer approved">
                          <StatusBadge status="SUSPENDED" />
                        </span>
                      ) : (
                        <form action={toggleStoreProduct.bind(null, sp.id)}>
                          <button className="cursor-pointer" title="Click to toggle">
                            <StatusBadge status={sp.active ? "ACTIVE" : "CANCELLED"} />
                          </button>
                        </form>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Link href={`/merchant/products/${sp.id}`} className="btn btn-ghost btn-sm" aria-label="Edit">
                          <Pencil size={14} />
                        </Link>
                        <form action={removeStoreProduct.bind(null, sp.id)}>
                          <SubmitButton className="btn btn-ghost btn-sm text-red-600" confirm={`Remove “${sp.title}” from your store?`}>
                            <Trash2 size={14} />
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
