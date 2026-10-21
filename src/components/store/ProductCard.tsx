import Link from "next/link";
import { formatMoney } from "@/lib/money";

export function ProductCard({
  href,
  title,
  image,
  price,
  compareAtPrice,
  hasVariants,
  soldOut,
}: {
  href: string;
  title: string;
  image?: string;
  price: number;
  compareAtPrice?: number | null;
  hasVariants?: boolean;
  soldOut?: boolean;
}) {
  const onSale = compareAtPrice && compareAtPrice > price;
  return (
    <Link href={href} className="group block">
      <div className="relative overflow-hidden rounded-2xl bg-ink-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt={title} loading="lazy" className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105" />}
        {onSale && !soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">Sale</span>
        )}
        {soldOut && <span className="absolute left-3 top-3 rounded-full bg-ink-900 px-2.5 py-1 text-xs font-semibold text-white">Sold out</span>}
      </div>
      <h3 className="mt-3 font-medium leading-snug group-hover:underline">{title}</h3>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-semibold">
          {hasVariants ? "From " : ""}
          {formatMoney(price)}
        </span>
        {onSale && <span className="text-sm text-ink-400 line-through">{formatMoney(compareAtPrice!)}</span>}
      </p>
    </Link>
  );
}
