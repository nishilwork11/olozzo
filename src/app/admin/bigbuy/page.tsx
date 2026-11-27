import type { Metadata } from "next";
import Link from "next/link";
import { Database, PackageSearch, PlugZap, RefreshCw } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, EmptyState, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { bigBuyStatus } from "@/lib/bigbuy/client";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { pullBigBuyTaxonomyAction, syncBigBuyNowAction, testBigBuyConnection } from "./actions";

export const metadata: Metadata = { title: "BigBuy · Admin" };

export default async function AdminBigBuy({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const [status, imported, logs, cachedCount] = await Promise.all([
    bigBuyStatus(),
    db.bigBuyProduct.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.bigBuySyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.bigBuyCatalogItem.count(),
  ]);
  const products = await db.product.findMany({
    where: { id: { in: imported.map((b) => b.productId) } },
    select: { id: true, title: true },
  });
  const titleOf = new Map(products.map((p) => [p.id, p.title]));

  return (
    <>
      <PageHeader
        title="BigBuy"
        description="Connect your BigBuy account, cache its catalogue, then browse and import products. BigBuy products are fulfilled automatically after payment — Stripe checkout is unaffected."
      />
      <Flash {...flash} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <div className="flex items-center gap-2">
            <PlugZap className="text-brand-600" size={18} />
            <h2 className="font-semibold">Connection</h2>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Status</span>
              <StatusBadge status={status.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Environment</span>
              <Badge className={status.sandbox ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                {status.sandbox ? "Sandbox" : "Production"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Credentials</span>
              <Badge className={status.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                {status.configured ? "BIGBUY_API_KEY set" : "Not configured"}
              </Badge>
            </div>
            {status.lastCheckAt && (
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Last checked</span>
                <span>{formatDateTime(status.lastCheckAt)}</span>
              </div>
            )}
            {status.lastError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{status.lastError}</p>}
          </div>
          {!status.configured && (
            <p className="mt-3 text-xs text-ink-500">
              Set <code className="rounded bg-ink-100 px-1">BIGBUY_API_KEY</code> in your environment (see{" "}
              <code className="rounded bg-ink-100 px-1">.env.example</code>), then test the connection.
            </p>
          )}
          <form action={testBigBuyConnection} className="mt-4">
            <SubmitButton className="btn btn-primary w-full" pendingText="Testing…">Test connection</SubmitButton>
          </form>
          <Link href="/admin/bigbuy/browse" className="btn btn-secondary mt-2 flex w-full items-center justify-center gap-2">
            <PackageSearch size={16} /> Browse BigBuy products
          </Link>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Database className="text-brand-600" size={18} />
            <h2 className="font-semibold">Catalogue cache</h2>
          </div>
          <p className="mt-2 text-sm text-ink-500">
            BigBuy has no live product search, so products are pulled one first-level taxonomy at a time into a local
            cache that Browse &amp; import reads. <span className="font-medium text-ink-700">{cachedCount.toLocaleString()}</span> products cached.
          </p>
          <form action={pullBigBuyTaxonomyAction} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-ink-500">First-level taxonomy id</span>
              <input name="taxonomy" type="number" min="1" placeholder="e.g. 19756" className="input w-48" required />
            </label>
            <SubmitButton className="btn btn-primary" pendingText="Pulling…">Pull taxonomy</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-ink-400">
            Find taxonomy ids via <code className="rounded bg-ink-100 px-1">GET /rest/catalog/taxonomies.json?firstLevel</code>.
          </p>
          <hr className="my-4 border-ink-100" />
          <form action={syncBigBuyNowAction}>
            <SubmitButton className="btn btn-secondary inline-flex items-center gap-2" pendingText="Syncing…">
              <RefreshCw size={15} /> Sync imported products now
            </SubmitButton>
          </form>
          <p className="mt-2 text-xs text-ink-400">Refreshes cost &amp; stock for imported products; never changes retail prices.</p>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={`Imported products (${imported.length})`} />
        {imported.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Nothing imported yet" />
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>BigBuy SKU</th>
                <th>Sync</th>
                <th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {imported.map((b) => (
                <tr key={b.id}>
                  <td>{titleOf.get(b.productId) ?? <span className="text-ink-400">(removed)</span>}</td>
                  <td className="font-mono text-xs">{b.bbSku}</td>
                  <td>
                    <StatusBadge status={b.syncStatus} />
                  </td>
                  <td className="text-xs text-ink-500">{formatDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent BigBuy activity" />
        {logs.length === 0 ? (
          <EmptyState icon={PlugZap} title="No BigBuy activity logged yet" />
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-5 py-2">
                <span>
                  <Badge
                    className={
                      l.level === "ERROR"
                        ? "bg-red-100 text-red-700"
                        : l.level === "WARN"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-ink-100 text-ink-600"
                    }
                  >
                    {l.kind}
                  </Badge>{" "}
                  {l.message}
                </span>
                <span className="text-xs text-ink-400">{formatDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
