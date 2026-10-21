import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartView } from "@/components/store/StoreClient";
import { getStorefront } from "@/lib/store";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Your cart</h1>
      <CartView freeShippingOver={store.freeShippingOver} shippingRate={store.shippingRate} />
    </div>
  );
}
