import { Boxes, CreditCard, Factory, FolderTree, LayoutDashboard, Mail, Receipt, ScrollText, ShieldCheck, Store, Users } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { requireUser } from "@/lib/auth";

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/emails", label: "Emails", icon: Mail },
  { href: "/admin/stores", label: "Stores", icon: Store },
  { href: "/admin/suppliers", label: "Suppliers", icon: Factory },
  { href: "/admin/products", label: "Products", icon: Boxes },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/roles", label: "Roles & access", icon: ShieldCheck },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN"]);
  return (
    <DashboardShell user={user} area="Platform admin" nav={NAV}>
      {children}
    </DashboardShell>
  );
}
