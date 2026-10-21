"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Lock, Tag, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";

type Quote = {
  lines: { storeProductId: string; variantId: string; title: string; variantName: string; image: string | null; quantity: number; unitPrice: number; lineTotal: number }[];
  issues: string[];
  subtotal: number;
  discountCode: string | null;
  discountTotal: number;
  discountError: string | null;
  shippingTotal: number;
  vatRate: number;
  vatTotal: number;
  total: number;
};

type PaymentOption = { id: string; label: string; description: string };

export function CheckoutForm({
  storeSlug,
  defaultCountry,
  countries,
  paymentOptions,
  prefill,
}: {
  storeSlug: string;
  defaultCountry: string;
  countries: { code: string; name: string }[];
  paymentOptions: PaymentOption[];
  prefill: { email: string; name: string } | null;
}) {
  const { items, ready, replace } = useCart();
  const [country, setCountry] = useState(defaultCountry);
  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [provider, setProvider] = useState(paymentOptions[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const cartKey = useMemo(() => JSON.stringify(items.map((i) => [i.storeProductId, i.variantId, i.quantity])), [items]);

  useEffect(() => {
    if (!ready || items.length === 0) return;
    const ctrl = new AbortController();
    setQuoting(true);
    fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeSlug,
        country,
        discountCode: appliedCode,
        items: items.map((i) => ({ storeProductId: i.storeProductId, variantId: i.variantId, quantity: i.quantity })),
      }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((q: Quote) => {
        setQuote(q);
        if (q.issues?.length) {
          // Sync the cart with what is actually available
          setNotices(q.issues);
          replace(
            q.lines.map((l) => {
              const prev = items.find((i) => i.storeProductId === l.storeProductId && i.variantId === l.variantId);
              return {
                storeProductId: l.storeProductId,
                variantId: l.variantId,
                slug: prev?.slug ?? "",
                title: l.title,
                variantName: l.variantName,
                image: l.image,
                price: l.unitPrice,
                quantity: l.quantity,
                maxStock: Math.max(l.quantity, prev?.maxStock ?? l.quantity),
              };
            }),
          );
        }
        if (q.discountError) setAppliedCode(null);
      })
      .catch(() => {})
      .finally(() => setQuoting(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cartKey, country, appliedCode, storeSlug]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug,
          provider,
          discountCode: appliedCode,
          acceptTerms: fd.get("acceptTerms") === "on",
          items: items.map((i) => ({ storeProductId: i.storeProductId, variantId: i.variantId, quantity: i.quantity })),
          shipping: {
            email: get("email"),
            name: get("name"),
            phone: get("phone") || null,
            addressLine1: get("addressLine1"),
            addressLine2: get("addressLine2") || null,
            city: get("city"),
            postalCode: get("postalCode"),
            country,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        if (data.issues) setNotices(data.issues);
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (!ready) return <div className="mt-8 h-96 animate-pulse rounded-2xl bg-ink-50" />;
  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-ink-300 py-16 text-center">
        <p className="font-semibold">Your cart is empty</p>
        <Link href={`/s/${storeSlug}`} className="btn btn-accent mt-5">
          Continue shopping
        </Link>
      </div>
    );
  }

  const countryName = countries.find((c) => c.code === country)?.name ?? country;

  return (
    <form ref={formRef} onSubmit={submit} className="mt-8 grid gap-10 lg:grid-cols-5">
      <div className="space-y-8 lg:col-span-3">
        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" defaultValue={prefill?.email} className="input" />
              <p className="mt-1 text-xs text-ink-500">We&apos;ll send your order confirmation and tracking here.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Shipping address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="country">Country</label>
              <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className="input" autoComplete="country">
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" name="name" required autoComplete="name" defaultValue={prefill?.name} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="addressLine1">Street and house number</label>
              <input id="addressLine1" name="addressLine1" required autoComplete="address-line1" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="addressLine2">Apartment, suite, etc. (optional)</label>
              <input id="addressLine2" name="addressLine2" autoComplete="address-line2" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="postalCode">Postal code</label>
              <input id="postalCode" name="postalCode" required autoComplete="postal-code" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="city">City</label>
              <input id="city" name="city" required autoComplete="address-level2" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="phone">Phone (optional, for the courier)</label>
              <input id="phone" name="phone" type="tel" autoComplete="tel" className="input" />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Payment</h2>
          {paymentOptions.length === 0 ? (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">This store has no payment method configured yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {paymentOptions.map((o) => (
                <label
                  key={o.id}
                  className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition", provider === o.id ? "border-ink-900 ring-1 ring-ink-900" : "border-ink-200 hover:border-ink-300")}
                >
                  <input type="radio" name="provider" value={o.id} checked={provider === o.id} onChange={() => setProvider(o.id)} className="mt-1" />
                  <span>
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-sm text-ink-500">{o.description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        <label className="flex items-start gap-3 text-sm text-ink-600">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4" />
          <span>
            I have read the{" "}
            <Link href="/legal/terms" target="_blank" className="underline">terms and conditions</Link> and the{" "}
            <Link href="/legal/withdrawal" target="_blank" className="underline">right of withdrawal</Link>, and I agree to the processing of my data as described in the{" "}
            <Link href="/legal/privacy" target="_blank" className="underline">privacy policy</Link>.
          </span>
        </label>

        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} /> {error}
          </p>
        )}

        <button type="submit" disabled={submitting || quoting || !provider || !quote || quote.lines.length === 0} className="btn btn-accent btn-lg w-full">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
          Buy now · {quote ? formatMoney(quote.total) : "…"}
        </button>
        <p className="text-center text-xs text-ink-500">Order with obligation to pay. You will be redirected to complete payment securely.</p>
      </div>

      {/* Summary */}
      <aside className="lg:col-span-2">
        <div className="card sticky top-24 p-6">
          <h2 className="font-semibold">Order summary</h2>
          {notices.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {notices.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
          <ul className="mt-4 space-y-4">
            {(quote?.lines ?? items.map((i) => ({ ...i, unitPrice: i.price, lineTotal: i.price * i.quantity }))).map((l) => (
              <li key={`${l.storeProductId}:${l.variantId}`} className="flex gap-3">
                <div className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image ? <img src={l.image} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="h-16 w-16 rounded-lg bg-ink-100" />}
                  <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-ink-700 px-1 text-[11px] font-bold text-white">{l.quantity}</span>
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium leading-snug">{l.title}</p>
                  {l.variantName !== "Default" && <p className="text-ink-500">{l.variantName}</p>}
                </div>
                <p className="text-sm font-medium">{formatMoney(l.lineTotal)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex gap-2">
            <div className="relative flex-1">
              <Tag size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="Discount code"
                className="input pl-8 uppercase"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (codeInput.trim()) setAppliedCode(codeInput.trim());
                  }
                }}
              />
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => codeInput.trim() && setAppliedCode(codeInput.trim())}>
              Apply
            </button>
          </div>
          {quote?.discountError && <p className="mt-2 text-xs text-red-600">{quote.discountError}</p>}

          <dl className={cn("mt-5 space-y-2 text-sm transition", quoting && "opacity-50")}>
            <div className="flex justify-between">
              <dt className="text-ink-500">Subtotal</dt>
              <dd>{quote ? formatMoney(quote.subtotal) : "…"}</dd>
            </div>
            {quote?.discountCode && (
              <div className="flex justify-between text-emerald-700">
                <dt className="flex items-center gap-1">
                  Discount ({quote.discountCode})
                  <button type="button" onClick={() => { setAppliedCode(null); setCodeInput(""); }} aria-label="Remove discount">
                    <X size={13} />
                  </button>
                </dt>
                <dd>−{formatMoney(quote.discountTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-500">Shipping to {countryName}</dt>
              <dd>{quote ? (quote.shippingTotal === 0 ? "Free" : formatMoney(quote.shippingTotal)) : "…"}</dd>
            </div>
            <div className="flex justify-between border-t border-ink-100 pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd>{quote ? formatMoney(quote.total) : "…"}</dd>
            </div>
            {quote && (
              <p className="text-xs text-ink-500">
                Including {formatMoney(quote.vatTotal)} VAT ({Number((quote.vatRate * 100).toFixed(1))}% {country})
              </p>
            )}
          </dl>
        </div>
      </aside>
    </form>
  );
}
