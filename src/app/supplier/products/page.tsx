import Link from "next/link";
import { Boxes, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, EmptyState, Flash, PageHeader, ProductThumb, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { requireSupplier } from "@/lib/supplier";
import { parseImages } from "@/lib/utils";
import { deleteSupplierProduct, toggleSupplierProduct } from "../actions";

export default async function SupplierProducts({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const { supplier } = await requireSupplier();
  const products = await db.product.findMany({
    where: { supplierId: supplier.id },
    include: { variants: true, category: true, _count: { select: { storeProducts: true, orderItems: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Wholesale catalog"
        description="Products merchants can import. Prices are your wholesale cost per unit (excl. VAT)."
        actions={
          <>
            <Link href="/supplier/import" className="btn btn-secondary">
              <FileUp size={16} /> CSV import
            </Link>
            <Link href="/supplier/products/new" className="btn btn-primary">
              <Plus size={16} /> Add product
            </Link>
          </>
        }
      />
      <Flash {...flash} />
      {products.length === 0 ? (
        <Card>
          <EmptyState
            icon={Boxes}
            title="No products yet"
            description="Add your first product or bulk-upload your catalog from a CSV file."
            action={<Link href="/supplier/products/new" className="btn btn-primary">Add product</Link>}
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Cost</th>
                <th className="text-right">RRP</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Stores</th>
                <th className="text-right">Sold</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const stock = p.variants.reduce((s, v) => s + v.stock, 0);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <ProductThumb src={parseImages(p.images)[0]} alt={p.title} className="h-11 w-11 shrink-0" />
                        <div>
                          <Link href={`/supplier/products/${p.id}`} className="font-medium hover:underline">
                            {p.title}
                          </Link>
                          <p className="text-xs text-ink-500">
                            {p.sku} · {p.category?.name ?? "Uncategorised"} · {p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-medium">{formatMoney(p.costPrice)}</td>
                    <td className="text-right text-ink-500">{formatMoney(p.suggestedPrice)}</td>
                    <td className={`text-right ${stock === 0 ? "font-semibold text-red-600" : stock <= 10 ? "text-amber-600" : ""}`}>{stock}</td>
                    <td className="text-right">{p._count.storeProducts}</td>
                    <td className="text-right">{p._count.orderItems}</td>
                    <td>
                      <form action={toggleSupplierProduct.bind(null, p.id)}>
                        <button title="Click to toggle">
                          <StatusBadge status={p.active ? "ACTIVE" : "CANCELLED"} />
                        </button>
                      </form>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Link href={`/supplier/products/${p.id}`} className="btn btn-ghost btn-sm" aria-label="Edit">
                          <Pencil size={14} />
                        </Link>
                        <form action={deleteSupplierProduct.bind(null, p.id)}>
                          <SubmitButton className="btn btn-ghost btn-sm text-red-600" confirm={`Delete “${p.title}”? It will be removed from ${p._count.storeProducts} store(s).`}>
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
