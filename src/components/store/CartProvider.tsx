"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  storeProductId: string;
  variantId: string;
  slug: string;
  title: string;
  variantName: string;
  image: string | null;
  price: number; // display snapshot — the server re-prices at checkout
  quantity: number;
  maxStock: number;
};

type CartContextValue = {
  storeSlug: string;
  items: CartItem[];
  ready: boolean;
  count: number;
  subtotal: number;
  add: (item: CartItem) => void;
  setQuantity: (storeProductId: string, variantId: string, quantity: number) => void;
  remove: (storeProductId: string, variantId: string) => void;
  clear: () => void;
  replace: (items: CartItem[]) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ storeSlug, children }: { storeSlug: string; children: React.ReactNode }) {
  const key = `olozzo_cart_${storeSlug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore corrupt or blocked storage */
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* storage blocked */
    }
  }, [items, key, ready]);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.storeProductId === item.storeProductId && i.variantId === item.variantId);
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, quantity: Math.min(i.maxStock, i.quantity + item.quantity), price: item.price } : i,
        );
      }
      return [...prev, { ...item, quantity: Math.min(item.maxStock, item.quantity) }];
    });
  }, []);

  const setQuantity = useCallback((storeProductId: string, variantId: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.storeProductId === storeProductId && i.variantId === variantId
            ? { ...i, quantity: Math.max(0, Math.min(i.maxStock, quantity)) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const remove = useCallback((storeProductId: string, variantId: string) => {
    setItems((prev) => prev.filter((i) => !(i.storeProductId === storeProductId && i.variantId === variantId)));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const replace = useCallback((next: CartItem[]) => setItems(next), []);

  const value = useMemo<CartContextValue>(
    () => ({
      storeSlug,
      items,
      ready,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
      replace,
    }),
    [storeSlug, items, ready, add, setQuantity, remove, clear, replace],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
