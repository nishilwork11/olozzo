import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export default async function AdminAudit() {
  const logs = await db.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageHeader title="Audit log" description="Security-relevant actions across the platform (last 300 events)." />
      <Card className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-ink-500">{formatDateTime(l.createdAt)}</td>
                <td>{l.user ? <span title={l.user.email}>{l.user.name}</span> : <span className="text-ink-400">System</span>}</td>
                <td>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs">{l.action}</span>
                </td>
                <td className="text-ink-600">{l.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
