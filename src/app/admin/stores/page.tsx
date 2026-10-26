import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, Flash, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { updateStoreAdmin } from "../actions";

export const metadata: Metadata = { title: "Stores · Admin" };

export default async function AdminStores({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const [stores, revenue] = await Promise.all([
    db.store.findMany({ include: { owner: true, _count: { select: { products: true, orders: true } } }, orderBy: { createdAt: "asc" } }),
    db.order.groupBy({ by: ["storeId"], where: { paymentStatus: "PAID" }, _sum: { total: true, platformFee: true } }),
  ]);
  const rev = new Map(revenue.map((r) => [r.storeId, r._sum]));

  return (
    <>
      <PageHeader title="Stores" description="Every merchant storefront on olozzo. Change plans or take a store offline." />
      <Flash {...flash} />
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Store</th>
              <th>Owner</th>
              <th>Products</th>
              <th>Orders</th>
              <th>GMV</th>
              <th>Fees</th>
              <th>Plan & visibility</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: s.accentColor }}>
                      {s.name.charAt(0)}
                    </span>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <Link href={`/s/${s.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-ink-500 hover:underline">
                        /s/{s.slug} <ExternalLink size={11} />
                      </Link>
                    </div>
                  </div>
                </td>
                <td className="text-ink-600">
                  {s.owner.name}
                  <p className="text-xs text-ink-500">{s.owner.email}</p>
                </td>
                <td>{s._count.products}</td>
                <td>{s._count.orders}</td>
                <td className="font-medium">{formatMoney(rev.get(s.id)?.total ?? 0)}</td>
                <td>{formatMoney(rev.get(s.id)?.platformFee ?? 0)}</td>
                <td>
                  <form action={updateStoreAdmin.bind(null, s.id)} className="flex items-center gap-2">
                    <select name="plan" defaultValue={s.plan} className="input w-auto py-1.5 text-xs">
                      {Object.values(PLANS).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="published" defaultChecked={s.published} /> Live
                    </label>
                    <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
