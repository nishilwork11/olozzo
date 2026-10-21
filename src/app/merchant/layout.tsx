import Link from "next/link";
import { Boxes, ExternalLink, LayoutDashboard, Percent, Receipt, Search, Settings } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { requireMerchantStore } from "@/lib/merchant";

const NAV: NavItem[] = [
  { href: "/merchant", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/merchant/orders", label: "Orders", icon: Receipt },
  { href: "/merchant/products", label: "My products", icon: Boxes },
  { href: "/merchant/catalog", label: "Find products", icon: Search },
  { href: "/merchant/discounts", label: "Discounts", icon: Percent },
  { href: "/merchant/settings", label: "Store settings", icon: Settings },
];

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { user, store } = await requireMerchantStore();
  return (
    <DashboardShell
      user={user}
      area="Merchant"
      nav={NAV}
      footer={
        <Link
          href={`/s/${store.slug}`}
          target="_blank"
          className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2.5 text-sm hover:bg-ink-50"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: store.accentColor }} />
            <span className="truncate font-medium">{store.name}</span>
          </span>
          <ExternalLink size={14} className="shrink-0 text-ink-400" />
        </Link>
      }
    >
      {children}
    </DashboardShell>
  );
}
