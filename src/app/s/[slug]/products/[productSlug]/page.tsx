import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/store/ProductCard";
import { Gallery, ProductPurchase } from "@/components/store/StoreClient";
import { db } from "@/lib/db";
import { countryName } from "@/lib/eu";
import { formatMoney } from "@/lib/money";
import { variantRetailPrice } from "@/lib/pricing";
import { deliveryWindow, getStorefront } from "@/lib/store";
import { parseImages } from "@/lib/utils";

async function load(slug: string, productSlug: string) {
  const store = await getStorefront(slug);
  if (!store) return null;
  const sp = await db.storeProduct.findUnique({
    where: { storeId_slug: { storeId: store.id, slug: productSlug } },
    include: {
      product: {
        include: { variants: { where: { position: { lt: 999 } }, orderBy: { position: "asc" } }, supplier: true, category: true },
      },
    },
  });
  if (!sp || !sp.active || !sp.product.active || sp.product.supplier.status !== "APPROVED") return null;
  return { store, sp };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; productSlug: string }> }): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const data = await load(slug, productSlug);
  if (!data) return { title: "Product not found" };
  return {
    title: data.sp.title,
    description: data.sp.description.slice(0, 160),
    openGraph: { images: parseImages(data.sp.product.images).slice(0, 1) },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string; productSlug: string }> }) {
  const { slug, productSlug } = await params;
  const data = await load(slug, productSlug);
  if (!data) notFound();
  const { store, sp } = data;
  const { product } = sp;
  const images = parseImages(product.images);
  const variants = product.variants.map((v) => ({
    id: v.id,
    name: v.name,
    stock: v.stock,
    price: variantRetailPrice(sp.price, product.costPrice, v.costPrice),
  }));
  const eta = deliveryWindow(product.supplier.processingDays, product.shippingDaysMin, product.shippingDaysMax);

  const related = await db.storeProduct.findMany({
    where: {
      storeId: store.id,
      active: true,
      id: { not: sp.id },
      product: { active: true, supplier: { status: "APPROVED" }, ...(product.categoryId ? { categoryId: product.categoryId } : {}) },
    },
    include: { product: true },
    take: 4,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav className="mb-6 flex items-center gap-1 text-sm text-ink-500">
        <Link href={`/s/${store.slug}`} className="hover:text-ink-900">
          Home
        </Link>
        {product.category && (
          <>
            <ChevronRight size={14} />
            <Link href={`/s/${store.slug}?category=${product.category.slug}`} className="hover:text-ink-900">
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight size={14} />
        <span className="truncate text-ink-900">{sp.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <Gallery images={images} title={sp.title} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{sp.title}</h1>
          <div className="mt-5">
            <ProductPurchase
              storeProductId={sp.id}
              slug={sp.slug}
              title={sp.title}
              image={images[0] ?? null}
              variants={variants}
              compareAtPrice={sp.compareAtPrice}
              basePrice={sp.price}
            />
          </div>

          <div className="mt-8 space-y-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-5 text-sm">
            <p className="flex items-start gap-3">
              <Truck size={18} className="mt-0.5 shrink-0 text-accent" />
              <span>
                <b>Estimated delivery {eta.from} – {eta.to}</b>
                <br />
                <span className="text-ink-500">
                  {store.freeShippingOver !== null
                    ? `Free shipping over ${formatMoney(store.freeShippingOver)}, otherwise ${formatMoney(store.shippingRate)}`
                    : `Shipping ${formatMoney(store.shippingRate)}`}
                </span>
              </span>
            </p>
            <p className="flex items-center gap-3">
              <MapPin size={18} className="shrink-0 text-accent" /> Ships from {countryName(product.supplier.country)} — no customs fees within the EU
            </p>
            <p className="flex items-center gap-3">
              <RotateCcw size={18} className="shrink-0 text-accent" /> 14-day right of withdrawal
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck size={18} className="shrink-0 text-accent" /> Secure payment · VAT included
            </p>
          </div>

          <div className="mt-8">
            <h2 className="font-semibold">Description</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-600">{sp.description}</p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="text-2xl font-bold tracking-tight">You may also like</h2>
          <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-4">
            {related.map((r) => (
              <ProductCard
                key={r.id}
                href={`/s/${store.slug}/products/${r.slug}`}
                title={r.title}
                image={parseImages(r.product.images)[0]}
                price={r.price}
                compareAtPrice={r.compareAtPrice}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
