import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { db } from "@/lib/db";
import { countryName } from "@/lib/eu";
import { formatMoney } from "@/lib/money";
import { parseImages } from "@/lib/utils";

export const metadata: Metadata = { title: "Explore stores" };
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const stores = await db.store.findMany({
    where: { published: true },
    include: {
      products: {
        where: { active: true, product: { active: true } },
        include: { product: true },
        orderBy: [{ featured: "desc" }, { createdAt: "asc" }],
        take: 4,
      },
      _count: { select: { products: { where: { active: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight">Explore olozzo stores</h1>
        <p className="mt-3 max-w-2xl text-ink-500">
          Independent European brands powered by olozzo. Every order ships from an EU warehouse — no customs, no surprises.
        </p>

        <div className="mt-12 space-y-10">
          {stores.map((store) => (
            <div key={store.id} className="card overflow-hidden" style={{ "--accent": store.accentColor } as React.CSSProperties}>
              <div className="flex flex-col gap-4 border-b border-ink-100 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-xl text-lg font-bold text-white" style={{ background: store.accentColor }}>
                    {store.name.charAt(0)}
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold">{store.name}</h2>
                    <p className="text-sm text-ink-500">
                      {store.tagline ?? "Online store"} · {store._count.products} products · based in {countryName(store.country)}
                    </p>
                  </div>
                </div>
                <Link href={`/s/${store.slug}`} className="btn btn-accent">
                  Visit store <ArrowRight size={16} />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
                {store.products.map((sp) => (
                  <Link key={sp.id} href={`/s/${store.slug}/products/${sp.slug}`} className="group">
                    <div className="overflow-hidden rounded-xl bg-ink-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={parseImages(sp.product.images)[0]}
                        alt={sp.title}
                        className="aspect-square w-full object-cover transition group-hover:scale-105"
                      />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{sp.title}</p>
                    <p className="text-sm font-semibold">{formatMoney(sp.price)}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {stores.length === 0 && <p className="text-ink-500">No stores are live yet.</p>}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
