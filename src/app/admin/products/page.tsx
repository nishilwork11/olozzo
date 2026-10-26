import type { Metadata } from "next";
import { Search } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, Flash, PageHeader, ProductThumb, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parseImages } from "@/lib/utils";
import { toggleProductActive } from "../actions";

export const metadata: Metadata = { title: "Product moderation · Admin" };

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  const { q, ...flash } = await searchParams;
  const products = await db.product.findMany({
    where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {},
    include: { supplier: true, category: true, variants: true, _count: { select: { storeProducts: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Product moderation" description="Hide products that violate EU product safety rules or platform policy. Hidden products disappear from every store." />
      <Flash {...flash} />
      <form className="relative mb-4 max-w-xs">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input name="q" defaultValue={q} placeholder="Search title or SKU" className="input pl-8" />
      </form>
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Product</th>
              <th>Supplier</th>
              <th>Cost</th>
              <th>RRP</th>
              <th>Stock</th>
              <th>In stores</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <ProductThumb src={parseImages(p.images)[0]} alt={p.title} className="h-10 w-10 shrink-0" />
                    <div>
                      <p className="font-medium">{p.title}</p>
                      <p className="text-xs text-ink-500">
                        {p.sku} · {p.category?.name ?? "Uncategorised"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="text-ink-600">
                  {p.supplier.companyName}
                  {p.supplier.status !== "APPROVED" && <StatusBadge status={p.supplier.status} className="ml-1" />}
                </td>
                <td>{formatMoney(p.costPrice)}</td>
                <td>{formatMoney(p.suggestedPrice)}</td>
                <td>{p.variants.reduce((s, v) => s + v.stock, 0)}</td>
                <td>{p._count.storeProducts}</td>
                <td>
                  <StatusBadge status={p.active ? "ACTIVE" : "SUSPENDED"} />
                </td>
                <td className="text-right">
                  <form action={toggleProductActive.bind(null, p.id)}>
                    <SubmitButton className={p.active ? "btn btn-danger btn-sm" : "btn btn-secondary btn-sm"}>{p.active ? "Hide" : "Restore"}</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
