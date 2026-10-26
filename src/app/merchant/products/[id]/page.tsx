import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, CardHeader, Field, Flash, PageHeader, ProductThumb } from "@/components/ui";
import { db } from "@/lib/db";
import { countryName } from "@/lib/eu";
import { requireMerchantStore } from "@/lib/merchant";
import { centsToInput, formatMoney } from "@/lib/money";
import { variantRetailPrice } from "@/lib/pricing";
import { parseImages } from "@/lib/utils";
import { updateStoreProduct } from "../../actions";

export const metadata: Metadata = { title: "Edit product · Merchant" };

export default async function EditStoreProduct({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const { store } = await requireMerchantStore();
  const sp = await db.storeProduct.findFirst({
    where: { id, storeId: store.id },
    include: { product: { include: { supplier: true, variants: { orderBy: { position: "asc" } } } } },
  });
  if (!sp) notFound();
  const { product } = sp;
  const images = parseImages(product.images);

  return (
    <>
      <Link href="/merchant/products" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={14} /> My products
      </Link>
      <PageHeader
        title={sp.title}
        actions={
          <Link href={`/s/${store.slug}/products/${sp.slug}`} target="_blank" className="btn btn-secondary">
            View in store <ExternalLink size={14} />
          </Link>
        }
      />
      <Flash {...flash} />

      <div className="grid gap-6 lg:grid-cols-3">
        <form action={updateStoreProduct.bind(null, sp.id)} className="space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-6">
            <Field label="Title" htmlFor="title">
              <input id="title" name="title" defaultValue={sp.title} required className="input" />
            </Field>
            <Field label="Description" htmlFor="description">
              <textarea id="description" name="description" defaultValue={sp.description} rows={7} className="input" />
            </Field>
            <Field label="URL handle" htmlFor="slug" hint={`/s/${store.slug}/products/…`}>
              <input id="slug" name="slug" defaultValue={sp.slug} className="input font-mono text-xs" />
            </Field>
          </Card>
          <Card className="space-y-4 p-6">
            <h2 className="font-semibold">Pricing</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (€, incl. VAT)" htmlFor="price" hint={`Supplier RRP ${formatMoney(product.suggestedPrice)}`}>
                <input id="price" name="price" inputMode="decimal" defaultValue={centsToInput(sp.price)} required className="input" />
              </Field>
              <Field label="Compare-at price (€)" htmlFor="compareAtPrice" hint="Shown struck-through to signal a sale">
                <input id="compareAtPrice" name="compareAtPrice" inputMode="decimal" defaultValue={centsToInput(sp.compareAtPrice)} className="input" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-6 pt-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="active" defaultChecked={sp.active} className="h-4 w-4" /> Visible in store
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="featured" defaultChecked={sp.featured} className="h-4 w-4" /> Featured on homepage
              </label>
            </div>
          </Card>
          <div className="flex justify-end">
            <SubmitButton className="btn btn-primary btn-lg" pendingText="Saving…">Save product</SubmitButton>
          </div>
        </form>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-2">
              {images.map((src) => (
                <ProductThumb key={src} src={src} alt="" className="aspect-square w-full" />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-500">Images are managed by the supplier.</p>
          </Card>
          <Card>
            <CardHeader title="Supplier" />
            <dl className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Company</dt><dd className="font-medium">{product.supplier.companyName}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Ships from</dt><dd>{countryName(product.supplier.country)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Delivery</dt><dd>{product.supplier.processingDays + product.shippingDaysMin}–{product.supplier.processingDays + product.shippingDaysMax} business days</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Supplier shipping</dt><dd>{formatMoney(product.shippingCost)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">SKU</dt><dd className="font-mono text-xs">{product.sku}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Variants" />
            <table className="table-base">
              <thead>
                <tr><th>Option</th><th className="text-right">Cost</th><th className="text-right">Your price</th><th className="text-right">Stock</th></tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td className="text-right text-ink-500">{formatMoney(v.costPrice)}</td>
                    <td className="text-right font-medium">{formatMoney(variantRetailPrice(sp.price, product.costPrice, v.costPrice))}</td>
                    <td className={`text-right ${v.stock === 0 ? "text-red-600" : ""}`}>{v.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
