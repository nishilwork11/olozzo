"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import type { FormState } from "@/app/supplier/actions";

type Variant = { id?: string; name: string; sku: string; cost: string; stock: string };

export type ProductFormValues = {
  title: string;
  description: string;
  categoryId: string;
  sku: string;
  costPrice: string;
  suggestedPrice: string;
  shippingCost: string;
  shippingDaysMin: string;
  shippingDaysMax: string;
  weightGrams: string;
  images: string;
  active: boolean;
  variants: Variant[];
};

export function ProductForm({
  action,
  initial,
  categories,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial: ProductFormValues;
  categories: { id: string; name: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [variants, setVariants] = useState<Variant[]>(initial.variants.length ? initial.variants : [{ name: "Default", sku: "", cost: "", stock: "0" }]);

  const update = (i: number, patch: Partial<Variant>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="variants" value={JSON.stringify(variants.map((v) => ({ ...v, stock: Number(v.stock) || 0 })))} />
      {state?.error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {state.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card space-y-4 p-6">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" name="title" defaultValue={initial.title} required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" name="description" defaultValue={initial.description} rows={6} required className="input" />
              <p className="mt-1 text-xs text-ink-500">Include materials, dimensions, certifications (CE, GPSR) and care instructions.</p>
            </div>
            <div>
              <label className="label" htmlFor="images">Image URLs (one per line)</label>
              <textarea id="images" name="images" defaultValue={initial.images} rows={3} required className="input font-mono text-xs" placeholder="https://…" />
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Variants & stock</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVariants((vs) => [...vs, { name: "", sku: "", cost: "", stock: "0" }])}>
                <Plus size={14} /> Add variant
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-500">E.g. sizes or colours. Leave cost empty to use the base cost.</p>
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-[1fr_1fr_90px_80px_32px] gap-2 text-xs font-medium text-ink-500">
                <span>Name</span>
                <span>SKU</span>
                <span>Cost (€)</span>
                <span>Stock</span>
                <span />
              </div>
              {variants.map((v, i) => (
                <div key={v.id ?? `new-${i}`} className="grid grid-cols-[1fr_1fr_90px_80px_32px] gap-2">
                  <input value={v.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="e.g. Black / M" required className="input" />
                  <input value={v.sku} onChange={(e) => update(i, { sku: e.target.value })} placeholder="auto" className="input font-mono text-xs" />
                  <input value={v.cost} onChange={(e) => update(i, { cost: e.target.value })} placeholder="base" inputMode="decimal" className="input" />
                  <input value={v.stock} onChange={(e) => update(i, { stock: e.target.value })} type="number" min={0} className="input" />
                  <button
                    type="button"
                    disabled={variants.length === 1}
                    onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}
                    className="grid place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label="Remove variant"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card space-y-4 p-6">
            <h2 className="font-semibold">Pricing</h2>
            <div>
              <label className="label" htmlFor="costPrice">Wholesale cost (€, excl. VAT)</label>
              <input id="costPrice" name="costPrice" defaultValue={initial.costPrice} inputMode="decimal" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="suggestedPrice">Recommended retail price (€, incl. VAT)</label>
              <input id="suggestedPrice" name="suggestedPrice" defaultValue={initial.suggestedPrice} inputMode="decimal" required className="input" />
            </div>
          </section>
          <section className="card space-y-4 p-6">
            <h2 className="font-semibold">Organisation</h2>
            <div>
              <label className="label" htmlFor="categoryId">Category</label>
              <select id="categoryId" name="categoryId" defaultValue={initial.categoryId} className="input">
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sku">Base SKU</label>
              <input id="sku" name="sku" defaultValue={initial.sku} className="input font-mono text-xs" placeholder="auto" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4" /> Active (available to merchants)
            </label>
          </section>
          <section className="card space-y-4 p-6">
            <h2 className="font-semibold">Shipping</h2>
            <div>
              <label className="label" htmlFor="shippingCost">Shipping fee per order (€)</label>
              <input id="shippingCost" name="shippingCost" defaultValue={initial.shippingCost} inputMode="decimal" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="shippingDaysMin">Transit min (days)</label>
                <input id="shippingDaysMin" name="shippingDaysMin" type="number" min={0} defaultValue={initial.shippingDaysMin} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="shippingDaysMax">Transit max (days)</label>
                <input id="shippingDaysMax" name="shippingDaysMax" type="number" min={0} defaultValue={initial.shippingDaysMax} className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="weightGrams">Weight (g)</label>
              <input id="weightGrams" name="weightGrams" type="number" min={0} defaultValue={initial.weightGrams} className="input" />
            </div>
          </section>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn btn-primary btn-lg">
          {pending && <Loader2 size={18} className="animate-spin" />} {submitLabel}
        </button>
      </div>
    </form>
  );
}
