import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { PERMISSIONS, PROTECTED_AREAS, ROLE_LABELS, ROLE_PERMISSIONS, ROLES, type Permission } from "@/lib/rbac";

export const metadata: Metadata = { title: "Roles & access · Admin" };

export default async function AdminRoles() {
  const counts = await db.user.groupBy({ by: ["role"], _count: true });
  const countFor = (role: string) => counts.find((c) => c.role === role)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Roles & access control"
        description="olozzo uses role-based access control (RBAC). Each user has exactly one role; each role grants a fixed set of permissions. Change a user's role on the Users page."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="p-5">
            <p className="text-sm font-semibold">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-2xl font-bold">{countFor(r)}</p>
            <p className="text-xs text-ink-500">{ROLE_PERMISSIONS[r].length} permissions</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Permission</th>
              {ROLES.map((r) => (
                <th key={r} className="text-center">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
              <tr key={p}>
                <td>
                  <p className="font-mono text-xs font-semibold">{p}</p>
                  <p className="text-xs text-ink-500">{PERMISSIONS[p]}</p>
                </td>
                {ROLES.map((r) => (
                  <td key={r} className="text-center">
                    {ROLE_PERMISSIONS[r].includes(p) ? (
                      <Check size={16} className="mx-auto text-emerald-600" />
                    ) : (
                      <Minus size={16} className="mx-auto text-ink-300" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Protected areas</h2>
        <p className="mt-1 text-sm text-ink-500">
          Enforced in three layers: edge middleware (signed session token), server layouts (fresh database lookup) and every server action
          (permission check).
        </p>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {PROTECTED_AREAS.map((a) => (
            <li key={a.prefix} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
              <span className="font-mono">{a.prefix}</span>
              <span className="text-xs text-ink-500">{a.roles.length === ROLES.length ? "Any signed-in user" : a.roles.join(", ")}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
