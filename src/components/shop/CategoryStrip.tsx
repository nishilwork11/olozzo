import Link from "next/link";
import { categoryIcon } from "@/components/shop/CategoryIcon";
import { RailScroller } from "@/components/shop/ProductRail";
import { imageAtWidth } from "@/components/store/ProductCard";
import type { CategoryNode } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/** Round picture (or icon when the category has no products yet) with the category name underneath. */
export function CategoryTile({
  href,
  name,
  image,
  icon,
  current = false,
  className,
}: {
  href: string;
  name: string;
  image: string | null;
  icon: string | null;
  current?: boolean;
  className?: string;
}) {
  const Icon = categoryIcon(icon);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "group flex h-full flex-col items-center gap-1.5 rounded-xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        className,
      )}
    >
      <span
        className={cn(
          "grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-700 ring-1 transition sm:h-[72px] sm:w-[72px]",
          current ? "ring-2 ring-brand-600" : "ring-ink-200 group-hover:ring-2 group-hover:ring-brand-500",
        )}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageAtWidth(image, 160)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
        )}
      </span>
      <span className={cn("line-clamp-2 text-xs leading-tight text-ink-700 group-hover:text-ink-950", current && "font-semibold text-ink-950")}>
        {name}
      </span>
    </Link>
  );
}

/** Every top-level category as a round tile, in a sideways scroller (two rows from the lg breakpoint). */
export function CategoryStrip({ categories, label = "Shop by category" }: { categories: CategoryNode[]; label?: string }) {
  if (categories.length === 0) return null;
  return (
    <RailScroller
      label={label}
      className="-m-1 grid snap-x auto-cols-[80px] grid-flow-col grid-rows-1 gap-x-1 gap-y-3 p-1 sm:auto-cols-[92px] lg:grid-rows-2"
    >
      {categories.map((c) => (
        <li key={c.id} className="snap-start">
          <CategoryTile href={`/c/${c.slug}`} name={c.name} image={c.image} icon={c.icon} />
        </li>
      ))}
    </RailScroller>
  );
}
