import { Check, CircleCheck, CircleDashed } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, CardHeader, Field, Flash, PageHeader } from "@/components/ui";
import { EU_COUNTRIES } from "@/lib/eu";
import { requireMerchantStore } from "@/lib/merchant";
import { centsToInput, formatMoney } from "@/lib/money";
import { demoPaymentsEnabled } from "@/lib/payments";
import { mollieEnabled } from "@/lib/payments/mollie";
import { stripeEnabled } from "@/lib/payments/stripe";
import { PLANS } from "@/lib/plans";
import { changePlan, updateStoreSettings } from "../actions";

export default async function StoreSettings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const { store } = await requireMerchantStore();
  const providers = [
    { name: "Stripe", on: stripeEnabled(), text: "Cards, Apple/Google Pay, SEPA, iDEAL, Bancontact, Klarna, EPS, P24" },
    { name: "Mollie", on: mollieEnabled(), text: "iDEAL, Bancontact, SOFORT, PayPal, cards" },
    { name: "Demo payments", on: demoPaymentsEnabled(), text: "Test mode — simulates successful payments" },
  ];

  return (
    <>
      <PageHeader title="Store settings" description="Branding, shipping, pricing rules and your olozzo plan." />
      <Flash {...flash} />

      <form action={updateStoreSettings} className="space-y-6">
        <Card>
          <CardHeader title="Store details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Store name" htmlFor="name">
              <input id="name" name="name" defaultValue={store.name} required className="input" />
            </Field>
            <Field label="Store address" htmlFor="slug" hint="Your store lives at /s/<address>">
              <input id="slug" name="slug" defaultValue={store.slug} className="input font-mono text-xs" />
            </Field>
            <Field label="Tagline" htmlFor="tagline" className="sm:col-span-2">
              <input id="tagline" name="tagline" defaultValue={store.tagline ?? ""} placeholder="Shown as the homepage headline" className="input" />
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <textarea id="description" name="description" defaultValue={store.description ?? ""} rows={3} className="input" />
            </Field>
            <Field label="Support email" htmlFor="supportEmail">
              <input id="supportEmail" name="supportEmail" type="email" defaultValue={store.supportEmail ?? ""} className="input" />
            </Field>
            <Field label="Business country" htmlFor="country">
              <select id="country" name="country" defaultValue={store.country} className="input">
                {EU_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="published" defaultChecked={store.published} className="h-4 w-4" />
              Store is published (visible to customers)
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Branding" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Brand colour" htmlFor="accentColor">
              <input
                id="accentColor"
                name="accentColor"
                type="color"
                defaultValue={store.accentColor}
                className="h-10 w-full cursor-pointer rounded-lg border border-ink-200 bg-white p-1"
              />
            </Field>
            <Field label="Logo URL" htmlFor="logoUrl">
              <input id="logoUrl" name="logoUrl" type="url" defaultValue={store.logoUrl ?? ""} placeholder="https://…" className="input" />
            </Field>
            <Field label="Homepage banner URL" htmlFor="bannerUrl">
              <input id="bannerUrl" name="bannerUrl" type="url" defaultValue={store.bannerUrl ?? ""} placeholder="https://…" className="input" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Shipping & pricing rules" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Flat shipping rate (€)" htmlFor="shippingRate" hint="Charged to customers per order">
              <input id="shippingRate" name="shippingRate" inputMode="decimal" defaultValue={centsToInput(store.shippingRate)} className="input" />
            </Field>
            <Field label="Free shipping over (€)" htmlFor="freeShippingOver" hint="Leave empty to never offer free shipping">
              <input id="freeShippingOver" name="freeShippingOver" inputMode="decimal" defaultValue={centsToInput(store.freeShippingOver)} className="input" />
            </Field>
            <Field label="Import markup (%)" htmlFor="markupPercent" hint={`Cost €10 → ${formatMoney(Math.round(1000 * (1 + store.markupPercent / 100)))}`}>
              <input id="markupPercent" name="markupPercent" type="number" min={0} max={1000} defaultValue={store.markupPercent} className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="priceEnding99" defaultChecked={store.priceEnding99} className="h-4 w-4" />
              Round imported prices to .99 (e.g. €43.12 → €43.99)
            </label>
          </div>
        </Card>

        <div className="flex justify-end">
          <SubmitButton className="btn btn-primary btn-lg" pendingText="Saving…">Save settings</SubmitButton>
        </div>
      </form>

      <Card className="mt-10 scroll-mt-24">
        <div id="payments" />
        <CardHeader title="Payment providers" />
        <ul className="divide-y divide-ink-100">
          {providers.map((p) => (
            <li key={p.name} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-ink-500">{p.text}</p>
              </div>
              {p.on ? (
                <span className="flex items-center gap-1 text-sm font-medium text-emerald-700"><CircleCheck size={16} /> Active</span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-ink-400"><CircleDashed size={16} /> Not configured</span>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
          Payment keys are configured by the platform operator in <code className="rounded bg-ink-100 px-1">.env</code> (STRIPE_SECRET_KEY, MOLLIE_API_KEY).
        </p>
      </Card>

      <h2 className="mb-4 mt-10 text-lg font-semibold">Your plan</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((plan) => {
          const current = store.plan === plan.id;
          return (
            <Card key={plan.id} className={`p-5 ${current ? "border-brand-600 ring-2 ring-brand-600" : ""}`}>
              <p className="font-semibold">{plan.name}</p>
              <p className="mt-1 text-2xl font-bold">
                {formatMoney(plan.monthly)}
                <span className="text-sm font-normal text-ink-500">/mo</span>
              </p>
              <p className="text-xs text-ink-500">{(plan.feeRate * 100).toFixed(1)}% transaction fee</p>
              <ul className="mt-4 space-y-1.5 text-xs text-ink-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-1.5"><Check size={13} className="mt-0.5 shrink-0 text-brand-600" /> {f}</li>
                ))}
              </ul>
              {current ? (
                <p className="mt-5 text-center text-sm font-semibold text-brand-700">Current plan</p>
              ) : (
                <form action={changePlan.bind(null, plan.id)} className="mt-5">
                  <SubmitButton className="btn btn-secondary w-full">Switch to {plan.name}</SubmitButton>
                </form>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
