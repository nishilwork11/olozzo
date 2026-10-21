import { Percent, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, EmptyState, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { requireMerchantStore } from "@/lib/merchant";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { createDiscount, deleteDiscount, toggleDiscount } from "../actions";

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const { store } = await requireMerchantStore();
  const discounts = await db.discountCode.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageHeader title="Discount codes" description="Codes customers can enter at checkout." />
      <Flash {...flash} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit p-5">
          <h2 className="font-semibold">Create a code</h2>
          <form action={createDiscount} className="mt-4 space-y-4">
            <Field label="Code" htmlFor="code">
              <input id="code" name="code" required placeholder="SUMMER20" className="input uppercase" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" htmlFor="type">
                <select id="type" name="type" className="input">
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED">Fixed amount (€)</option>
                </select>
              </Field>
              <Field label="Value" htmlFor="value">
                <input id="value" name="value" required inputMode="decimal" placeholder="20" className="input" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min. order (€)" htmlFor="minSubtotal">
                <input id="minSubtotal" name="minSubtotal" inputMode="decimal" placeholder="0" className="input" />
              </Field>
              <Field label="Max uses" htmlFor="maxUses">
                <input id="maxUses" name="maxUses" type="number" min={1} placeholder="∞" className="input" />
              </Field>
            </div>
            <Field label="Expires on (optional)" htmlFor="expiresAt">
              <input id="expiresAt" name="expiresAt" type="date" className="input" />
            </Field>
            <SubmitButton className="btn btn-primary w-full">Create discount</SubmitButton>
          </form>
        </Card>

        <Card className="overflow-x-auto lg:col-span-2">
          {discounts.length === 0 ? (
            <EmptyState icon={Percent} title="No discount codes yet" description="A welcome code like WELCOME10 is a proven way to convert first-time visitors." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Conditions</th>
                  <th>Used</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => {
                  const expired = d.expiresAt && d.expiresAt < new Date();
                  return (
                    <tr key={d.id}>
                      <td className="font-mono font-semibold">{d.code}</td>
                      <td>{d.type === "PERCENT" ? `${d.value}% off` : `${formatMoney(d.value)} off`}</td>
                      <td className="text-xs text-ink-500">
                        {d.minSubtotal > 0 ? `Min. ${formatMoney(d.minSubtotal)}` : "No minimum"}
                        {d.expiresAt && <span className="block">Until {formatDate(d.expiresAt)}</span>}
                      </td>
                      <td>
                        {d.usedCount}
                        {d.maxUses ? ` / ${d.maxUses}` : ""}
                      </td>
                      <td>
                        <form action={toggleDiscount.bind(null, d.id)}>
                          <button title="Click to toggle">
                            <StatusBadge status={expired ? "CANCELLED" : d.active ? "ACTIVE" : "SUSPENDED"} />
                          </button>
                        </form>
                      </td>
                      <td className="text-right">
                        <form action={deleteDiscount.bind(null, d.id)}>
                          <SubmitButton className="btn btn-ghost btn-sm text-red-600" confirm={`Delete ${d.code}?`}>
                            <Trash2 size={14} />
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
