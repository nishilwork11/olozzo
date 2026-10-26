import type { Metadata } from "next";
import { Search } from "lucide-react";
import { AutoSubmitSelect, SubmitButton } from "@/components/client";
import { Card, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, ROLES } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { setUserStatus, updateUserRole } from "../actions";

export const metadata: Metadata = { title: "Users · Admin" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; ok?: string; error?: string }> }) {
  const { q, role, ...flash } = await searchParams;
  const me = await getCurrentUser();
  const users = await db.user.findMany({
    where: {
      ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
      ...(role ? { role } : {}),
    },
    include: { store: { select: { name: true } }, supplier: { select: { companyName: true } }, _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Users" description="Assign roles and suspend accounts. Role changes take effect immediately." />
      <Flash {...flash} />
      <form className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input name="q" defaultValue={q} placeholder="Search name or email" className="input pl-8" />
        </div>
        <select name="role" defaultValue={role ?? ""} className="input w-auto">
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>User</th>
              <th>Business</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-ink-500">{u.email}</p>
                </td>
                <td className="text-ink-600">{u.store?.name ?? u.supplier?.companyName ?? (u._count.orders ? `${u._count.orders} orders` : "—")}</td>
                <td>
                  {u.id === me?.id ? (
                    <span className="text-xs font-medium">{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]} (you)</span>
                  ) : (
                    <form action={updateUserRole.bind(null, u.id)}>
                      <AutoSubmitSelect name="role" defaultValue={u.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
                    </form>
                  )}
                </td>
                <td>
                  <StatusBadge status={u.status} />
                </td>
                <td className="whitespace-nowrap text-ink-500">{formatDate(u.createdAt)}</td>
                <td className="text-right">
                  {u.id !== me?.id && (
                    <form action={setUserStatus.bind(null, u.id, u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}>
                      <SubmitButton
                        className={u.status === "ACTIVE" ? "btn btn-danger btn-sm" : "btn btn-secondary btn-sm"}
                        confirm={u.status === "ACTIVE" ? `Suspend ${u.email}? They will be signed out immediately.` : undefined}
                      >
                        {u.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                      </SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
