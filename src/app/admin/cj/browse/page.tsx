import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Search } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, EmptyState, Flash, PageHeader, ProductThumb } from "@/components/ui";
import { cjConfigured } from "@/lib/cj/client";
import { cjSearch, type CjBrowseItem } from "@/lib/cj/products";
import { db } from "@/lib/db";
import { importCjProductAction } from "../actions";

export const metadata: Metadata = { title: "Browse CJ products · Admin" };

type SP = Promise<{ q?: string; page?: string; ok?: string; error?: string }>;

export default async function CjBrowse({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  let items: CjBrowseItem[] = [];
  let total = 0;
  let fetchError: string | null = null;

  if (!cjConfigured()) {
    fetchError = "CJ is not configured. Set CJ_EMAIL and CJ_API_KEY, then test the connection on the CJdropshipping page.";
  } else {
    try {
      const res = await cjSearch({ keyword: keyword || undefined, page, pageSize: 20 });
      items = res.items;
      total = res.total;
    } catch (err) {
      fetchError = err instanceof Error ? err.message : "Failed to load products from CJ.";
    }
  }

  // Which of these are already imported (dedupe hint in the UI).
  const importedPids = new Set(
    items.length
      ? (await db.cjProduct.findMany({ where: { cjPid: { in: items.map((i) => i.pid) } }, select: { cjPid: true } })).map((c) => c.cjPid)
      : [],
  );

  return (
    <>
      <Link href="/admin/cj" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft size={14} /> CJdropshipping
      </Link>
      <PageHeader title="Browse CJ products" description="Search CJdropshipping's catalogue and import products into the Olozzo shop." />
      <Flash ok={sp.ok} error={sp.error ?? fetchError ?? undefined} />

      <Card className="mb-6 p-4">
        <form className="flex gap-2" action="/admin/cj/browse" method="get">
          <input
            name="q"
            defaultValue={keyword}
            placeholder="Search products (e.g. phone case)…"
            className="input flex-1"
            type="search"
          />
          <SubmitButton className="btn btn-primary inline-flex items-center gap-2" pendingText="Searching…">
            <Search size={16} /> Search
          </SubmitButton>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState icon={PackageSearch} title={fetchError ? "Could not load products" : "No products found"} />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-500">{total.toLocaleString()} results</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((p) => {
              const done = importedPids.has(p.pid);
              return (
                <Card key={p.pid} className="flex flex-col p-4">
                  <ProductThumb src={p.image} alt={p.name} className="mb-3 aspect-square w-full rounded-lg object-cover" />
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium">{p.name}</p>
                  <p className="mt-1 text-xs text-ink-500">CJ cost ≈ ${p.priceUsd.toFixed(2)}</p>
                  {done ? (
                    <button type="button" disabled className="btn btn-secondary mt-3 w-full cursor-default opacity-60">
                      Imported
                    </button>
                  ) : (
                    <form action={importCjProductAction.bind(null, p.pid)} className="mt-3">
                      <SubmitButton className="btn btn-primary w-full" pendingText="Importing…">
                        Import
                      </SubmitButton>
                    </form>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between text-sm">
            <PageLink keyword={keyword} page={page - 1} disabled={page <= 1}>
              ← Previous
            </PageLink>
            <span className="text-ink-500">Page {page}</span>
            <PageLink keyword={keyword} page={page + 1} disabled={items.length < 20}>
              Next →
            </PageLink>
          </div>
        </>
      )}
    </>
  );
}

function PageLink({ keyword, page, disabled, children }: { keyword: string; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="text-ink-300">{children}</span>;
  const qs = new URLSearchParams();
  if (keyword) qs.set("q", keyword);
  qs.set("page", String(page));
  return (
    <Link href={`/admin/cj/browse?${qs}`} className="text-brand-600 hover:underline">
      {children}
    </Link>
  );
}
