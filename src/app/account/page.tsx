import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { Card, EmptyState, ProductThumb, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export default async function AccountOrders() {
  const user = await requireUser();
  const orders = await db.order.findMany({
    where: { customerId: user.id },
    include: { store: true, items: true },
    orderBy: { createdAt: "desc" },
  });

  if (orders.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ShoppingBag}
          title="No orders yet"
          description="Orders you place while signed in will appear here with live tracking."
          action={
            OPEN_STORE_ENABLED ? (
              <Link href="/explore" className="btn btn-primary">Explore stores</Link>
            ) : (
              <Link href="/#products" className="btn btn-primary">Start shopping</Link>
            )
          }
        />
      </Card>
    );
  }

  return (
    <ul className="space-y-4">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/account/orders/${o.id}`} className="card flex items-center gap-5 p-5 transition hover:shadow-md">
            <div className="flex -space-x-3">
              {o.items.slice(0, 3).map((it) => (
                <ProductThumb key={it.id} src={it.image} alt={it.title} className="h-14 w-14 border-2 border-white" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{o.store.name}</p>
              <p className="truncate text-sm text-ink-500">{o.items.map((i) => i.title).join(", ")}</p>
              <p className="mt-1 text-xs text-ink-500">
                <span className="font-mono">{o.number}</span> · {formatDate(o.createdAt)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatMoney(o.total)}</p>
              <StatusBadge status={o.status} />
            </div>
            <ChevronRight className="text-ink-300" size={18} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
