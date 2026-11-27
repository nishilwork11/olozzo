import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Search } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, Flash, PageHeader, ProductThumb } from "@/components/ui";
import { bbBrowse, type BbBrowseItem } from "@/lib/bigbuy/catalog";
import { db } from "@/lib/db";
import { importBigBuyProductAction } from "../actions";

export const metadata: Metadata = { title: "Browse BigBuy products · Admin" };

type SP = Promise<{ q?: string; tax?: string; page?: string; ok?: string; error?: string }>;

const PAGE_SIZE = 24;

export default async function BigBuyBrowse({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const taxonomy = Number(sp.tax) || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const { items, total } = await bbBrowse({ keyword: keyword || undefined, taxonomy, page, pageSize: PAGE_SIZE });

  const cachedTotal = await db.bigBuyCatalogItem.count();
  const importedSkus = new Set(
    items.length
      ? (await db.bigBuyProduct.findMany({ where: { bbSku: { in: items.map((i) => i.bbSku) } }, select: { bbSku: true } })).map((b) => b.bbSku)
      : [],
  );

  return (
    <>
      <Link href="/admin/bigbuy" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft size={14} /> BigBuy
      </Link>
      <PageHeader title="Browse BigBuy products" description="Search the cached BigBuy catalogue and import products into the Olozzo shop." />
      <Flash ok={sp.ok} error={sp.error} />

      {cachedTotal === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No cached products yet"
          description="Pull a first-level taxonomy into the cache from the BigBuy page first."
        />
      ) : (
        <>
          <Card className="mb-6 p-4">
            <form className="flex gap-2" action="/admin/bigbuy/browse" method="get">
              {taxonomy ? <input type="hidden" name="tax" value={taxonomy} /> : null}
              <input name="q" defaultValue={keyword} placeholder="Search by name or SKU…" className="input flex-1" type="search" />
              <SubmitButton className="btn btn-primary inline-flex items-center gap-2" pendingText="Searching…">
                <Search size={16} /> Search
              </SubmitButton>
            </form>
          </Card>

          {items.length === 0 ? (
            <EmptyState icon={PackageSearch} title="No products found" />
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-500">{total.toLocaleString()} results</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((p) => (
                  <ProductCard key={p.bbSku} p={p} imported={importedSkus.has(p.bbSku)} />
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between text-sm">
                <PageLink keyword={keyword} taxonomy={taxonomy} page={page - 1} disabled={page <= 1}>
                  ← Previous
                </PageLink>
                <span className="text-ink-500">Page {page}</span>
                <PageLink keyword={keyword} taxonomy={taxonomy} page={page + 1} disabled={page * PAGE_SIZE >= total}>
                  Next →
                </PageLink>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function ProductCard({ p, imported }: { p: BbBrowseItem; imported: boolean }) {
  return (
    <Card className="flex flex-col p-4">
      <ProductThumb src={p.image} alt={p.name} className="mb-3 aspect-square w-full rounded-lg object-cover" />
      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium">{p.name}</p>
      <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
        <span>BigBuy cost ≈ €{(p.costCents / 100).toFixed(2)}</span>
        {p.stock > 0 ? (
          <Badge className="bg-emerald-100 text-emerald-700">{p.stock} in stock</Badge>
        ) : (
          <Badge className="bg-red-100 text-red-700">Out of stock</Badge>
        )}
      </div>
      {imported ? (
        <button type="button" disabled className="btn btn-secondary mt-3 w-full cursor-default opacity-60">
          Imported
        </button>
      ) : (
        <form action={importBigBuyProductAction.bind(null, p.bbSku)} className="mt-3">
          <SubmitButton className="btn btn-primary w-full" pendingText="Importing…">
            Import
          </SubmitButton>
        </form>
      )}
    </Card>
  );
}

function PageLink({ keyword, taxonomy, page, disabled, children }: { keyword: string; taxonomy?: number; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="text-ink-300">{children}</span>;
  const qs = new URLSearchParams();
  if (keyword) qs.set("q", keyword);
  if (taxonomy) qs.set("tax", String(taxonomy));
  qs.set("page", String(page));
  return (
    <Link href={`/admin/bigbuy/browse?${qs}`} className="text-brand-600 hover:underline">
      {children}
    </Link>
  );
}
