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

/**
 * One checkout attempt. The key is sent with every checkout request so a retry (double click, back from the
 * payment page) reuses the same order; it is replaced once that cart has been bought.
 */
export type CheckoutAttempt = { key: string; orderId: string | null; orderPath: string | null };

type CartContextValue = {
  storeSlug: string;
  items: CartItem[];
  ready: boolean;
  count: number;
  subtotal: number;
  checkout: CheckoutAttempt;
  add: (item: CartItem) => void;
  setQuantity: (storeProductId: string, variantId: string, quantity: number) => void;
  remove: (storeProductId: string, variantId: string) => void;
  clear: () => void;
  replace: (items: CartItem[]) => void;
  rememberOrder: (orderId: string, orderPath: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function newAttempt(): CheckoutAttempt {
  const key =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
        );
  return { key, orderId: null, orderPath: null };
}

export function CartProvider({ storeSlug, children }: { storeSlug: string; children: React.ReactNode }) {
  const key = `olozzo_cart_${storeSlug}`;
  const checkoutStorageKey = `olozzo_checkout_${storeSlug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [checkout, setCheckout] = useState<CheckoutAttempt>({ key: "", orderId: null, orderPath: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore corrupt or blocked storage */
    }
    let attempt: CheckoutAttempt | null = null;
    try {
      const raw = localStorage.getItem(checkoutStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed.key === "string") attempt = { key: parsed.key, orderId: parsed.orderId ?? null, orderPath: parsed.orderPath ?? null };
    } catch {
      /* ignore */
    }
    setCheckout(attempt ?? newAttempt());
    setReady(true);
  }, [key, checkoutStorageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* storage blocked */
    }
  }, [items, key, ready]);

  useEffect(() => {
    if (!ready || !checkout.key) return;
    try {
      localStorage.setItem(checkoutStorageKey, JSON.stringify(checkout));
    } catch {
      /* storage blocked */
    }
  }, [checkout, checkoutStorageKey, ready]);

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

  // Called once the cart has been bought: the next purchase is a new checkout attempt
  const clear = useCallback(() => {
    setItems([]);
    setCheckout(newAttempt());
  }, []);
  const replace = useCallback((next: CartItem[]) => setItems(next), []);
  // Written straight to storage: the page navigates to the payment provider right after this call
  const rememberOrder = useCallback(
    (orderId: string, orderPath: string) => {
      const next = { ...checkout, orderId, orderPath };
      try {
        localStorage.setItem(checkoutStorageKey, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      setCheckout(next);
    },
    [checkout, checkoutStorageKey],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      storeSlug,
      items,
      ready,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
      checkout,
      add,
      setQuantity,
      remove,
      clear,
      replace,
      rememberOrder,
    }),
    [storeSlug, items, ready, checkout, add, setQuantity, remove, clear, replace, rememberOrder],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
