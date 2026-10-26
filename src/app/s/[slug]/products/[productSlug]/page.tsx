import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { Breadcrumbs, type Crumb } from "@/components/shop/SectionHeader";
import { ProductCard } from "@/components/store/ProductCard";
import { Gallery, ProductPurchase } from "@/components/store/StoreClient";
import { getCategory, getRelated, type ShopListing } from "@/lib/catalog";
import { db } from "@/lib/db";
import { countryName } from "@/lib/eu";
import { OPEN_STORE_ENABLED } from "@/lib/features";
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

const RELATED_LIMIT = 12;

/** "You may also like" in the shop: the same subcategory first, topped up from its parent category. */
async function shopRelated(listingId: string, title: string, categorySlug: string | undefined, parentSlug: string | undefined): Promise<ShopListing[]> {
  const own = await getRelated(categorySlug, listingId, RELATED_LIMIT);
  const more = own.length < RELATED_LIMIT && parentSlug ? await getRelated(parentSlug, listingId, RELATED_LIMIT + own.length) : [];
  const seen = new Set<string>();
  const related: ShopListing[] = [];
  for (const listing of [...own, ...more]) {
    // without a house store the same product can be listed by another store: skip that copy too
    if (seen.has(listing.id) || listing.title === title) continue;
    seen.add(listing.id);
    related.push(listing);
  }
  return related.slice(0, RELATED_LIMIT);
}

const BULLET = /^\s*[-•*–]\s+/;

/** Product description: paragraphs keep their line breaks; lines starting with "-", "•" or "*" become a list. */
function Description({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  text
    .trim()
    .split(/\n\s*\n/)
    .forEach((block) => {
      let paragraph: string[] = [];
      let list: string[] = [];
      const flush = () => {
        if (paragraph.length)
          parts.push(
            <p key={parts.length} className="whitespace-pre-line">
              {paragraph.join("\n")}
            </p>,
          );
        if (list.length)
          parts.push(
            <ul key={parts.length} className="list-disc space-y-1 pl-5 marker:text-ink-400">
              {list.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>,
          );
        paragraph = [];
        list = [];
      };
      for (const line of block.split("\n")) {
        if (BULLET.test(line)) {
          if (paragraph.length) flush();
          list.push(line.replace(BULLET, "").trim());
        } else {
          if (list.length) flush();
          paragraph.push(line.trimEnd());
        }
      }
      flush();
    });
  return <div className="mt-2 space-y-3 leading-relaxed text-ink-600">{parts}</div>;
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

  // Shop mode: breadcrumbs and suggestions come from the shop catalog. Platform mode: from this store.
  const found = !OPEN_STORE_ENABLED && product.category ? await getCategory(product.category.slug) : null;
  const crumbs: Crumb[] = OPEN_STORE_ENABLED
    ? [
        { label: "Home", href: `/s/${store.slug}` },
        ...(product.category ? [{ label: product.category.name, href: `/s/${store.slug}?category=${product.category.slug}` }] : []),
        { label: sp.title },
      ]
    : [
        { label: "Home", href: "/" },
        ...(found?.parent ? [{ label: found.parent.name, href: `/c/${found.parent.slug}` }] : []),
        ...(found ? [{ label: found.category.name, href: `/c/${found.category.slug}` }] : []),
        { label: sp.title },
      ];
  const shopSuggestions = OPEN_STORE_ENABLED ? [] : await shopRelated(sp.id, sp.title, found?.category.slug, found?.parent?.slug);
  const storeSuggestions = OPEN_STORE_ENABLED
    ? await db.storeProduct.findMany({
        where: {
          storeId: store.id,
          active: true,
          id: { not: sp.id },
          product: { active: true, supplier: { status: "APPROVED" }, ...(product.categoryId ? { categoryId: product.categoryId } : {}) },
        },
        include: { product: true },
        take: 4,
      })
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={crumbs} className="mb-6" />

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
            <Description text={sp.description} />
          </div>
        </div>
      </div>

      {shopSuggestions.length > 0 && (
        <section aria-labelledby="related-title" className="mt-16 border-t border-ink-100 pt-10">
          <h2 id="related-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            You may also like
          </h2>
          <ProductGrid items={shopSuggestions} label="You may also like" className="mt-5" />
        </section>
      )}
      {storeSuggestions.length > 0 && (
        <section aria-labelledby="related-title" className="mt-16 border-t border-ink-100 pt-10">
          <h2 id="related-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            You may also like
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
            {storeSuggestions.map((r) => (
              <li key={r.id}>
                <ProductCard
                  href={`/s/${store.slug}/products/${r.slug}`}
                  title={r.title}
                  image={parseImages(r.product.images)[0]}
                  price={r.price}
                  compareAtPrice={r.compareAtPrice}
                  sizes="(min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
