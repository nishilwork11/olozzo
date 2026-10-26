import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/supplier/ProductForm";
import { Flash, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { centsToInput } from "@/lib/money";
import { requireSupplier } from "@/lib/supplier";
import { parseImages } from "@/lib/utils";
import { updateProduct } from "../../actions";
import { getCategoryGroups } from "../category-groups";

export const metadata: Metadata = { title: "Edit product · Supplier" };

export default async function EditSupplierProduct({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const { supplier } = await requireSupplier();
  const [product, categories, storeCount] = await Promise.all([
    db.product.findFirst({ where: { id, supplierId: supplier.id }, include: { variants: { where: { position: { lt: 999 } }, orderBy: { position: "asc" } } } }),
    getCategoryGroups(),
    db.storeProduct.count({ where: { productId: id } }),
  ]);
  if (!product) notFound();

  return (
    <>
      <Link href="/supplier/products" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> Wholesale catalog
      </Link>
      <PageHeader title={product.title} description={`Sold by ${storeCount} store${storeCount === 1 ? "" : "s"}. Stock and cost changes apply instantly everywhere.`} />
      <Flash {...flash} />
      <ProductForm
        action={updateProduct.bind(null, product.id)}
        categories={categories}
        submitLabel="Save changes"
        initial={{
          title: product.title,
          description: product.description,
          categoryId: product.categoryId ?? "",
          sku: product.sku,
          costPrice: centsToInput(product.costPrice),
          suggestedPrice: centsToInput(product.suggestedPrice),
          shippingCost: centsToInput(product.shippingCost),
          shippingDaysMin: String(product.shippingDaysMin),
          shippingDaysMax: String(product.shippingDaysMax),
          weightGrams: String(product.weightGrams),
          images: parseImages(product.images).join("\n"),
          active: product.active,
          variants: product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            cost: v.costPrice === product.costPrice ? "" : centsToInput(v.costPrice),
            stock: String(v.stock),
          })),
        }}
      />
    </>
  );
}
