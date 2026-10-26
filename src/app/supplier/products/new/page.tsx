import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/supplier/ProductForm";
import { PageHeader } from "@/components/ui";
import { requireSupplier } from "@/lib/supplier";
import { createProduct } from "../../actions";
import { getCategoryGroups } from "../category-groups";

export const metadata: Metadata = { title: "Add product · Supplier" };

export default async function NewSupplierProduct() {
  await requireSupplier();
  const categories = await getCategoryGroups();
  return (
    <>
      <Link href="/supplier/products" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> Wholesale catalog
      </Link>
      <PageHeader title="Add product" />
      <ProductForm
        action={createProduct}
        categories={categories}
        submitLabel="Create product"
        initial={{
          title: "",
          description: "",
          categoryId: "",
          sku: "",
          costPrice: "",
          suggestedPrice: "",
          shippingCost: "3.90",
          shippingDaysMin: "2",
          shippingDaysMax: "5",
          weightGrams: "500",
          images: "",
          active: true,
          variants: [{ name: "Default", sku: "", cost: "", stock: "100" }],
        }}
      />
    </>
  );
}
