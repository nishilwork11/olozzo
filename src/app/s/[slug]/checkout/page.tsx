import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutForm } from "@/components/store/CheckoutForm";
import { getCurrentUser } from "@/lib/auth";
import { EU_COUNTRIES } from "@/lib/eu";
import { paymentOptions } from "@/lib/payments";
import { getStorefront } from "@/lib/store";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { slug } = await params;
  const { cancelled } = await searchParams;
  const [store, user] = await Promise.all([getStorefront(slug), getCurrentUser()]);
  if (!store) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
      {cancelled && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Payment was cancelled — your cart is still saved. You can try again or choose another payment method.
        </p>
      )}
      <CheckoutForm
        storeSlug={store.slug}
        defaultCountry={store.country}
        countries={EU_COUNTRIES.map((c) => ({ code: c.code, name: c.name }))}
        paymentOptions={paymentOptions()}
        prefill={user ? { email: user.email, name: user.name } : null}
      />
    </div>
  );
}
