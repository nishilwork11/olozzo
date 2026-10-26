import { ProductCard } from "@/components/store/ProductCard";
import type { ShopListing } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/** Dense product grid: 2 columns on phones up to 6 on wide screens. */
export function ProductGrid({
  items,
  label,
  eager = 0,
  ranked = false,
  className,
}: {
  items: ShopListing[];
  /** accessible name of the list */
  label?: string;
  /** how many of the first cards load their image right away */
  eager?: number;
  /** the items are in rank order: number the cards #1, #2… */
  ranked?: boolean;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn("grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}
    >
      {items.map((listing, i) => (
        <li key={listing.id}>
          <ProductCard listing={listing} eager={i < eager} rank={ranked ? i + 1 : undefined} />
        </li>
      ))}
    </ul>
  );
}
