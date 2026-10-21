import { Factory } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, EmptyState, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { countryName } from "@/lib/eu";
import { formatDate } from "@/lib/utils";
import { setSupplierStatus } from "../actions";

export default async function AdminSuppliers({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const suppliers = await db.supplier.findMany({
    include: { user: true, _count: { select: { products: true, fulfillments: true } } },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
  });
  const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 } as Record<string, number>;
  suppliers.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  return (
    <>
      <PageHeader title="Suppliers" description="Only approved suppliers' products are visible in the merchant catalog and storefronts." />
      <Flash {...flash} />
      <Card className="overflow-x-auto">
        {suppliers.length === 0 ? (
          <EmptyState icon={Factory} title="No suppliers yet" />
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Company</th>
                <th>Ships from</th>
                <th>VAT ID</th>
                <th>Products</th>
                <th>Fulfilments</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <p className="font-medium">{s.companyName}</p>
                    <p className="text-xs text-ink-500">
                      {s.user.name} · {s.user.email} · since {formatDate(s.createdAt)}
                    </p>
                    {s.description && <p className="mt-1 max-w-md text-xs text-ink-500">{s.description}</p>}
                  </td>
                  <td>{countryName(s.country)}</td>
                  <td className="font-mono text-xs">{s.vatNumber ?? "—"}</td>
                  <td>{s._count.products}</td>
                  <td>{s._count.fulfillments}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {s.status !== "APPROVED" && (
                        <form action={setSupplierStatus.bind(null, s.id, "APPROVED")}>
                          <SubmitButton className="btn btn-primary btn-sm">Approve</SubmitButton>
                        </form>
                      )}
                      {s.status !== "REJECTED" && (
                        <form action={setSupplierStatus.bind(null, s.id, "REJECTED")}>
                          <SubmitButton
                            className="btn btn-danger btn-sm"
                            confirm={s.status === "APPROVED" ? `Revoke ${s.companyName}? Their products will disappear from all stores.` : undefined}
                          >
                            {s.status === "APPROVED" ? "Revoke" : "Reject"}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
