import type { Metadata } from "next";
import Link from "next/link";
import { PackageSearch, PlugZap } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardHeader, EmptyState, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { cjStatus } from "@/lib/cj/client";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { testCjConnection } from "./actions";

export const metadata: Metadata = { title: "CJdropshipping · Admin" };

export default async function AdminCj({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const [status, imported, logs] = await Promise.all([
    cjStatus(),
    db.cjProduct.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.cjSyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const products = await db.product.findMany({
    where: { id: { in: imported.map((c) => c.productId) } },
    select: { id: true, title: true },
  });
  const titleOf = new Map(products.map((p) => [p.id, p.title]));

  return (
    <>
      <PageHeader
        title="CJdropshipping"
        description="Connect your CJ account, then browse and import products. CJ products are fulfilled automatically after payment — Stripe checkout is unaffected."
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
              <span className="text-ink-500">Credentials</span>
              <Badge className={status.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                {status.configured ? "CJ_API_KEY set" : "Not configured"}
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
              Set <code className="rounded bg-ink-100 px-1">CJ_EMAIL</code> and <code className="rounded bg-ink-100 px-1">CJ_API_KEY</code> in your
              environment (see <code className="rounded bg-ink-100 px-1">.env.example</code>), then test the connection.
            </p>
          )}
          <form action={testCjConnection} className="mt-4">
            <SubmitButton className="btn btn-primary w-full" pendingText="Testing…">Test connection</SubmitButton>
          </form>
          <Link href="/admin/cj/browse" className="btn btn-secondary mt-2 flex w-full items-center justify-center gap-2">
            <PackageSearch size={16} /> Browse CJ products
          </Link>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={`Imported products (${imported.length})`} />
          {imported.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Nothing imported yet" />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>CJ product id</th>
                  <th>Sync</th>
                  <th>Imported</th>
                </tr>
              </thead>
              <tbody>
                {imported.map((c) => (
                  <tr key={c.id}>
                    <td>{titleOf.get(c.productId) ?? <span className="text-ink-400">(removed)</span>}</td>
                    <td className="font-mono text-xs">{c.cjPid}</td>
                    <td>
                      <StatusBadge status={c.syncStatus} />
                    </td>
                    <td className="text-xs text-ink-500">{formatDateTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent CJ activity" />
        {logs.length === 0 ? (
          <EmptyState icon={PlugZap} title="No CJ activity logged yet" />
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
