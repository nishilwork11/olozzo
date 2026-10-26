import { unstable_cache } from "next/cache";
import { cache } from "react";
import { Lock, Receipt, RotateCcw, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { HOUSE_STORE_SLUG } from "@/lib/catalog";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type HouseStoreInfo = { freeShippingOver: number | null; supportEmail: string | null };

const loadHouseStoreInfo = unstable_cache(
  async (): Promise<HouseStoreInfo | null> => {
    const store = await db.store.findUnique({
      where: { slug: HOUSE_STORE_SLUG },
      select: { published: true, freeShippingOver: true, supportEmail: true },
    });
    // Until the house store is live, shoppers buy from the other stores and their own shipping terms apply
    return store?.published ? { freeShippingOver: store.freeShippingOver, supportEmail: store.supportEmail } : null;
  },
  ["olozzo-house-store-info-v1"],
  { revalidate: 60, tags: ["catalog"] },
);

/** Shipping threshold and support address of olozzo's own store; null while it does not exist or is unpublished. */
export const getHouseStoreInfo = cache(() => loadHouseStoreInfo());

// Visible from this breakpoint up, by position, so phones get a single tidy line
const SHOW_FROM = ["flex", "flex", "hidden sm:flex", "hidden md:flex", "hidden lg:flex"];

/** Slim bar above the header listing what every order really gets. */
export async function PromoBar() {
  const house = await getHouseStoreInfo();
  const items: { icon: LucideIcon; text: string }[] = [
    ...(house?.freeShippingOver != null
      ? [{ icon: Truck, text: `Free shipping over ${formatMoney(house.freeShippingOver).replace(/\.00$/, "")}` }]
      : []),
    { icon: RotateCcw, text: "14-day returns" },
    { icon: Warehouse, text: "Ships from EU warehouses" },
    { icon: Receipt, text: "VAT included" },
    { icon: Lock, text: "Secure payment" },
  ];
  return (
    <div className="bg-brand-700 text-white">
      <ul
        aria-label="Shopping with olozzo"
        className="mx-auto flex h-8 max-w-7xl items-center justify-center gap-x-5 overflow-hidden px-4 text-xs font-medium sm:gap-x-8 sm:px-6"
      >
        {items.map((item, i) => (
          <li key={item.text} className={cn("shrink-0 items-center gap-1.5 whitespace-nowrap", SHOW_FROM[i] ?? "hidden lg:flex")}>
            <item.icon size={14} className="text-brand-200" aria-hidden="true" />
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
