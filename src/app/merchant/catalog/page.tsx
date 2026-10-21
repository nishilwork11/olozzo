import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Check, Clock, MapPin, Search } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Flash, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { countryName, EU_COUNTRIES, vatRateFor } from "@/lib/eu";
import { requireMerchantStore } from "@/lib/merchant";
import { formatMoney } from "@/lib/money";
import { retailFromCost } from "@/lib/pricing";
import { parseImages } from "@/lib/utils";
import { importProduct } from "../actions";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; from?: string; sort?: string; ok?: string; error?: string }>;
}) {
  const { q, category, from, sort, ...flash } = await searchParams;
  const { store } = await requireMerchantStore();

  const where: Prisma.ProductWhereInput = {
    active: true,
    supplier: { status: "APPROVED", ...(from ? { country: from } : {}) },
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    ...(category ? { category: { slug: category } } : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === "cost" ? { costPrice: "asc" } : sort === "fast" ? { shippingDaysMax: "asc" } : { createdAt: "desc" };

  const [products, categories, imported, supplierCountries] = await Promise.all([
    db.product.findMany({ where, include: { supplier: true, variants: true, category: true }, orderBy, take: 120 }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.storeProduct.findMany({ where: { storeId: store.id }, select: { productId: true, id: true } }),
    db.supplier.findMany({ where: { status: "APPROVED" }, select: { country: true }, distinct: ["country"] }),
  ]);
  const vatRate = vatRateFor(store.country);
  const importedMap = new Map(imported.map((i) => [i.productId, i.id]));
  const returnTo = `/merchant/catalog?${new URLSearchParams(Object.entries({ q, category, from, sort }).filter(([, v]) => v) as [string, string][]).toString()}`;

  return (
    <>
      <PageHeader
        title="Find products"
        description={
          <>
            Verified EU suppliers. Imported products are priced with your rule: cost + {store.markupPercent}% markup
            {store.priceEnding99 ? ", rounded to .99" : ""} —{" "}
            <Link href="/merchant/settings" className="font-medium text-brand-700 hover:underline">change</Link>.
          </>
        }
      />
      <Flash {...flash} />

      <form className="mb-6 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input name="q" defaultValue={q} placeholder="Search products, e.g. headphones" className="input pl-8" />
        </div>
        <select name="category" defaultValue={category ?? ""} className="input w-auto">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <select name="from" defaultValue={from ?? ""} className="input w-auto">
          <option value="">Ships from anywhere in EU</option>
          {EU_COUNTRIES.filter((c) => supplierCountries.some((s) => s.country === c.code)).map((c) => (
            <option key={c.code} value={c.code}>Ships from {c.name}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sort ?? ""} className="input w-auto">
          <option value="">Newest</option>
          <option value="cost">Lowest cost</option>
          <option value="fast">Fastest delivery</option>
        </select>
        <button className="btn btn-dark">Search</button>
      </form>

      {products.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-500">No products match your filters.</Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const yourPrice = retailFromCost(p.costPrice, store.markupPercent, store.priceEnding99);
            const profit = Math.round(yourPrice / (1 + vatRate)) - p.costPrice - p.shippingCost;
            const stock = p.variants.reduce((s, v) => s + v.stock, 0);
            const importedId = importedMap.get(p.id);
            return (
              <Card key={p.id} className="flex flex-col overflow-hidden">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={parseImages(p.images)[0]} alt={p.title} className="aspect-[4/3] w-full bg-ink-100 object-cover" loading="lazy" />
                  {p.category && <Badge className="absolute left-3 top-3 bg-white/90">{p.category.name}</Badge>}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-semibold leading-snug">{p.title}</h3>
                  <p className="mt-1 text-xs text-ink-500">{p.supplier.companyName}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="flex items-center gap-1"><MapPin size={12} /> {countryName(p.supplier.country)}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {p.supplier.processingDays + p.shippingDaysMin}–{p.supplier.processingDays + p.shippingDaysMax} days
                    </span>
                    <span>{stock} in stock</span>
                    {p.variants.length > 1 && <span>{p.variants.length} variants</span>}
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-ink-50 p-3 text-center">
                    <div>
                      <dt className="text-[11px] text-ink-500">Cost</dt>
                      <dd className="text-sm font-semibold">{formatMoney(p.costPrice)}</dd>
                      <dd className="text-[10px] text-ink-400">+{formatMoney(p.shippingCost)} ship</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-500">Your price</dt>
                      <dd className="text-sm font-semibold">{formatMoney(yourPrice)}</dd>
                      <dd className="text-[10px] text-ink-400">RRP {formatMoney(p.suggestedPrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-500">Est. profit</dt>
                      <dd className={`text-sm font-semibold ${profit > 0 ? "text-emerald-700" : "text-red-600"}`}>{formatMoney(profit)}</dd>
                      <dd className="text-[10px] text-ink-400">excl. VAT</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex-1" />
                  {importedId ? (
                    <Link href={`/merchant/products/${importedId}`} className="btn btn-secondary w-full">
                      <Check size={16} className="text-emerald-600" /> In your store · Edit
                    </Link>
                  ) : (
                    <form action={importProduct.bind(null, p.id, returnTo)}>
                      <SubmitButton className="btn btn-primary w-full" pendingText="Importing…">Import to store</SubmitButton>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
