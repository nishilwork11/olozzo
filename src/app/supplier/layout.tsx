import { Boxes, Building2, FileUp, LayoutDashboard, Truck } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const NAV: NavItem[] = [
  { href: "/supplier", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/supplier/orders", label: "Fulfilment queue", icon: Truck },
  { href: "/supplier/products", label: "Wholesale catalog", icon: Boxes },
  { href: "/supplier/import", label: "CSV import", icon: FileUp },
  { href: "/supplier/profile", label: "Company profile", icon: Building2 },
];

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["SUPPLIER"]);
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  return (
    <DashboardShell
      user={user}
      area="Supplier"
      nav={NAV}
      footer={
        supplier && supplier.status !== "APPROVED" ? (
          <div className={`rounded-lg px-3 py-2.5 text-xs ${supplier.status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
            {supplier.status === "PENDING"
              ? "Your account is awaiting admin approval. Products are hidden from merchants until then."
              : "Your supplier application was rejected. Contact support for details."}
          </div>
        ) : null
      }
    >
      {children}
    </DashboardShell>
  );
}
