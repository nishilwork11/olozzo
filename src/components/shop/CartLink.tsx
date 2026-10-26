"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/store/CartProvider";
import { cn } from "@/lib/utils";

type CartLinkProps = { storeSlug: string; className?: string };

// Same key and format as CartProvider: a JSON array of cart items with a `quantity` each
function readSavedCount(storeSlug: string): number {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(`olozzo_cart_${storeSlug}`) ?? "[]");
    if (!Array.isArray(items)) return 0;
    return items.reduce<number>((sum, item) => {
      const quantity = (item as { quantity?: unknown } | null)?.quantity;
      return sum + (typeof quantity === "number" && quantity > 0 ? Math.floor(quantity) : 0);
    }, 0);
  } catch {
    return 0; // storage blocked or corrupt
  }
}

function CartLinkView({ href, count, className }: { href: string; count: number; className?: string }) {
  const label = count > 0 ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart";
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "flex items-center gap-2 rounded-full p-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:gap-3 lg:px-3",
        className,
      )}
    >
      <span className="relative">
        <ShoppingCart size={22} aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="hidden lg:inline">Cart</span>
    </Link>
  );
}

/**
 * Cart link with the number of items saved in this browser. Follows changes made in other tabs
 * (storage events) and re-reads whenever the page is shown again.
 */
export function CartLink({ storeSlug, className }: CartLinkProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(readSavedCount(storeSlug));
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === `olozzo_cart_${storeSlug}`) update();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [storeSlug]);

  return <CartLinkView href={`/s/${storeSlug}/cart`} count={count} className={className} />;
}

/** Cart link inside a store's <CartProvider>: shows the live count as items are added or removed. */
export function LiveCartLink({ className }: { className?: string }) {
  const { count, ready, storeSlug } = useCart();
  return <CartLinkView href={`/s/${storeSlug}/cart`} count={ready ? count : 0} className={className} />;
}
