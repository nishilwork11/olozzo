"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";
import { SunsetLoader } from "@/components/SunsetLoader";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";

export function CartButton() {
  const { count, ready, storeSlug } = useCart();
  return (
    <Link href={`/s/${storeSlug}/cart`} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-ink-100" aria-label="Cart">
      <ShoppingBag size={20} />
      {ready && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: "var(--accent)" }}>
          {count}
        </span>
      )}
    </Link>
  );
}

export type VariantOption = { id: string; name: string; price: number; stock: number };

export function ProductPurchase({
  storeProductId,
  slug,
  title,
  image,
  variants,
  compareAtPrice,
  basePrice,
}: {
  storeProductId: string;
  slug: string;
  title: string;
  image: string | null;
  variants: VariantOption[];
  compareAtPrice: number | null;
  basePrice: number;
}) {
  const { add, storeSlug } = useCart();
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const variant = variants.find((v) => v.id === variantId) ?? firstAvailable;
  const hasOptions = variants.length > 1 || variants[0]?.name !== "Default";
  const outOfStock = !variant || variant.stock <= 0;
  const compare = compareAtPrice && variant ? Math.round((compareAtPrice * variant.price) / basePrice) : null;

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(t);
  }, [added]);

  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold">{variant ? formatMoney(variant.price) : "—"}</span>
        {compare && compare > (variant?.price ?? 0) && (
          <>
            <span className="text-lg text-ink-400 line-through">{formatMoney(compare)}</span>
            <span className="rounded-full bg-sun-200 px-2 py-0.5 text-xs font-semibold text-ink-900">
              Save {Math.round((1 - (variant?.price ?? 0) / compare) * 100)}%
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-500">Incl. VAT, plus shipping</p>

      {hasOptions && (
        <div className="mt-6">
          <p className="label">Option: <span className="font-normal text-ink-500">{variant?.name}</span></p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                disabled={v.stock <= 0}
                className={cn(
                  "rounded-lg border px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:text-ink-300 disabled:line-through",
                  v.id === variant?.id ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 hover:border-ink-400",
                )}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-ink-200">
          <button type="button" className="grid h-11 w-10 place-items-center text-ink-600 hover:text-ink-900" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
            <Minus size={16} />
          </button>
          <span className="w-8 text-center font-semibold">{quantity}</span>
          <button
            type="button"
            className="grid h-11 w-10 place-items-center text-ink-600 hover:text-ink-900"
            onClick={() => setQuantity((q) => Math.min(variant?.stock ?? 1, 99, q + 1))}
            aria-label="Increase quantity"
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          type="button"
          disabled={outOfStock}
          className="btn btn-accent btn-lg flex-1"
          onClick={() => {
            if (!variant) return;
            add({ storeProductId, variantId: variant.id, slug, title, variantName: variant.name, image, price: variant.price, quantity, maxStock: variant.stock });
            setAdded(true);
          }}
        >
          {added ? <Check size={18} /> : <ShoppingCart size={18} />}
          {outOfStock ? "Sold out" : added ? "Added to cart" : "Add to cart"}
        </button>
      </div>
      {added && (
        <Link href={`/s/${storeSlug}/cart`} className="mt-3 block text-center text-sm font-semibold text-accent hover:underline">
          View cart & checkout →
        </Link>
      )}
      {variant && variant.stock > 0 && variant.stock <= 10 && (
        <p className="mt-3 text-sm font-medium text-amber-600">Only {variant.stock} left in stock</p>
      )}
    </div>
  );
}

export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return <div className="aspect-square rounded-2xl bg-ink-100" />;
  return (
    <div>
      <div className="overflow-hidden rounded-2xl bg-ink-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[active]} alt={title} className="aspect-square w-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-3">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              className={cn("overflow-hidden rounded-xl border-2", i === active ? "border-ink-900" : "border-transparent opacity-70 hover:opacity-100")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-20 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CartView({ freeShippingOver, shippingRate }: { freeShippingOver: number | null; shippingRate: number }) {
  const { items, ready, subtotal, setQuantity, remove, storeSlug } = useCart();

  if (!ready)
    return (
      <div className="grid h-64 place-items-center rounded-2xl bg-ink-50">
        <SunsetLoader size={56} label="Loading your cart" />
      </div>
    );
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-300 py-20 text-center">
        <ShoppingBag className="mx-auto text-ink-300" size={40} />
        <p className="mt-4 font-semibold">Your cart is empty</p>
        <Link href={`/s/${storeSlug}`} className="btn btn-accent mt-6">
          Continue shopping
        </Link>
      </div>
    );
  }

  const remaining = freeShippingOver !== null ? freeShippingOver - subtotal : null;
  const shipping = remaining !== null && remaining <= 0 ? 0 : shippingRate;

  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <ul className="divide-y divide-ink-100 lg:col-span-2">
        {items.map((item) => (
          <li key={`${item.storeProductId}:${item.variantId}`} className="flex gap-4 py-5">
            <Link href={`/s/${storeSlug}/products/${item.slug}`} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {item.image ? <img src={item.image} alt={item.title} className="h-24 w-24 rounded-xl object-cover" /> : <div className="h-24 w-24 rounded-xl bg-ink-100" />}
            </Link>
            <div className="flex flex-1 flex-col">
              <div className="flex justify-between gap-4">
                <div>
                  <Link href={`/s/${storeSlug}/products/${item.slug}`} className="font-medium hover:underline">
                    {item.title}
                  </Link>
                  {item.variantName !== "Default" && <p className="text-sm text-ink-500">{item.variantName}</p>}
                </div>
                <p className="font-semibold">{formatMoney(item.price * item.quantity)}</p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-3">
                <div className="flex items-center rounded-lg border border-ink-200">
                  <button className="grid h-9 w-9 place-items-center" onClick={() => setQuantity(item.storeProductId, item.variantId, item.quantity - 1)} aria-label="Decrease">
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                  <button className="grid h-9 w-9 place-items-center" onClick={() => setQuantity(item.storeProductId, item.variantId, item.quantity + 1)} aria-label="Increase">
                    <Plus size={14} />
                  </button>
                </div>
                <button className="flex items-center gap-1 text-sm text-ink-500 hover:text-red-600" onClick={() => remove(item.storeProductId, item.variantId)}>
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="card h-fit p-6">
        <h2 className="font-semibold">Order summary</h2>
        {remaining !== null && remaining > 0 && (
          <div className="mt-4">
            <p className="text-sm text-ink-600">
              Add <b>{formatMoney(remaining)}</b> for free shipping
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (subtotal / (freeShippingOver ?? 1)) * 100)}%`, background: "var(--accent)" }} />
            </div>
          </div>
        )}
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Subtotal</dt>
            <dd>{formatMoney(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Shipping</dt>
            <dd>{shipping === 0 ? "Free" : formatMoney(shipping)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink-100 pt-3 text-base font-semibold">
            <dt>Estimated total</dt>
            <dd>{formatMoney(subtotal + shipping)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-xs text-ink-500">Incl. VAT. Final VAT is calculated for your country at checkout.</p>
        <Link href={`/s/${storeSlug}/checkout`} className="btn btn-accent btn-lg mt-6 w-full">
          Checkout
        </Link>
      </div>
    </div>
  );
}

/** Empties the cart once the order it produced is paid (or submitted for a delayed payment). */
export function ClearCart({ orderId }: { orderId: string }) {
  const { clear, ready, checkout } = useCart();
  useEffect(() => {
    // Only the cart that became this order: opening an older order's page must not empty a new cart
    if (ready && checkout.orderId === orderId) clear();
  }, [ready, clear, checkout.orderId, orderId]);
  return null;
}
