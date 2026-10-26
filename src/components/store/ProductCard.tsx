import Link from "next/link";
import { ImageOff, Truck } from "lucide-react";
import type { ShopListing } from "@/lib/catalog";
import { countryName } from "@/lib/eu";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const UNSPLASH = /^https:\/\/images\.unsplash\.com\//;

/** The same picture at another width. Only Unsplash URLs can be resized; other URLs come back unchanged. */
export function imageAtWidth(src: string, width: number): string {
  if (!UNSPLASH.test(src)) return src;
  const url = new URL(src);
  url.searchParams.set("w", String(width));
  return url.toString();
}

function imageSrcSet(src: string, widths: number[]): string | undefined {
  if (!UNSPLASH.test(src)) return undefined;
  return widths.map((w) => `${imageAtWidth(src, w)} ${w}w`).join(", ");
}

/** Card widths in the dense product grid (2 columns on phones up to 6 on wide screens). */
const GRID_SIZES = "(min-width: 1280px) 200px, (min-width: 1024px) 19vw, (min-width: 768px) 24vw, (min-width: 640px) 31vw, 47vw";

type LegacyProps = {
  href: string;
  title: string;
  image?: string | null;
  price: number;
  compareAtPrice?: number | null;
  /** The variants have different prices: the price shown is the lowest one ("From …") */
  hasVariants?: boolean;
  soldOut?: boolean;
};

export type ProductCardProps = ({ listing: ShopListing } | (LegacyProps & { listing?: undefined })) & {
  /** `sizes` attribute for the image; the default fits the product grid */
  sizes?: string;
  /** Load the image right away (only for cards at the top of the page) */
  eager?: boolean;
  /** Position in a ranked list such as "Trending now", shown as a #1, #2… badge */
  rank?: number;
  className?: string;
};

export function ProductCard(props: ProductCardProps) {
  const { sizes = GRID_SIZES, eager = false, rank, className } = props;
  const listing = props.listing;
  const card = listing
    ? {
        href: listing.href,
        title: listing.title,
        image: listing.image,
        price: listing.price,
        compareAtPrice: listing.compareAtPrice,
        // A listing's price is its base variant's; other variants may cost more or less, so no "From"
        fromPrice: false,
        soldOut: listing.soldOut,
      }
    : {
        href: props.href,
        title: props.title,
        image: props.image ?? null,
        price: props.price,
        compareAtPrice: props.compareAtPrice ?? null,
        fromPrice: !!props.hasVariants,
        soldOut: !!props.soldOut,
      };
  const onSale = card.compareAtPrice !== null && card.compareAtPrice > card.price;
  const discount = listing ? listing.discountPercent : onSale ? Math.round((1 - card.price / card.compareAtPrice!) * 100) : 0;
  const days = listing
    ? listing.shippingDaysMin === listing.shippingDaysMax
      ? `${listing.shippingDaysMin} ${listing.shippingDaysMin === 1 ? "day" : "days"}`
      : `${listing.shippingDaysMin}–${listing.shippingDaysMax} days`
    : null;

  return (
    <Link
      href={card.href}
      className={cn(
        "group relative flex h-full flex-col rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-ink-100">
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageAtWidth(card.image, 480)}
            srcSet={imageSrcSet(card.image, [240, 360, 480, 720])}
            sizes={sizes}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className={cn(
              "h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
              card.soldOut && "opacity-60 grayscale",
            )}
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-300">
            <ImageOff size={28} aria-hidden="true" />
          </div>
        )}
        {discount > 0 && !card.soldOut && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-sun-400 px-1.5 py-0.5 text-xs font-bold leading-4 text-ink-950 shadow-sm">
            <span aria-hidden="true">-{discount}%</span>
            <span className="sr-only">{discount}% off</span>
          </span>
        )}
        {rank != null && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-plum-600 px-1.5 py-0.5 text-xs font-bold leading-4 text-white shadow-sm">
            <span aria-hidden="true">#{rank}</span>
            <span className="sr-only">Trending number {rank}</span>
          </span>
        )}
        {card.soldOut && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="rounded-full bg-ink-900/85 px-3 py-1 text-xs font-semibold text-white">Sold out</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-1 flex-col px-0.5">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[13px] leading-[1.25] text-ink-800 group-hover:text-ink-950 group-hover:underline">
          {card.title}
        </h3>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-base font-bold tracking-tight text-ink-950">
            {card.fromPrice && <span className="text-xs font-semibold">From </span>}
            {formatMoney(card.price)}
          </span>
          {onSale && (
            <span className="text-xs text-ink-500 line-through">
              <span className="sr-only">Was </span>
              {formatMoney(card.compareAtPrice!)}
            </span>
          )}
        </p>
        {listing && (
          <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-tight text-ink-500">
            <Truck size={12} className="mt-px shrink-0" aria-hidden="true" />
            {/* on narrow cards this wraps after the "·", never inside the country or the days */}
            <span>
              <span className="whitespace-nowrap">Ships from {countryName(listing.shipsFrom)}&nbsp;·</span>{" "}
              <span className="whitespace-nowrap">{days}</span>
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}
