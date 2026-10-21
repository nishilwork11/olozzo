"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle, Factory, Loader2, ShoppingBag, Store } from "lucide-react";
import { registerAction } from "@/app/actions/auth";
import { EU_COUNTRIES } from "@/lib/eu";
import { cn } from "@/lib/utils";

type RegisterRole = "MERCHANT" | "SUPPLIER" | "CUSTOMER";

const ROLE_OPTIONS: { id: RegisterRole; title: string; text: string; icon: typeof Store }[] = [
  { id: "MERCHANT", title: "Sell", text: "Open a dropshipping store", icon: Store },
  { id: "SUPPLIER", title: "Supply", text: "List wholesale products", icon: Factory },
  { id: "CUSTOMER", title: "Shop", text: "Buy from olozzo stores", icon: ShoppingBag },
];

export function RegisterForm({ initialRole }: { initialRole: RegisterRole }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  const [role, setRole] = useState<RegisterRole>((state?.fields?.role as RegisterRole) || initialRole);
  const f = state?.fields;

  return (
    <form action={action} className="mt-8 space-y-5">
      {state?.error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" /> {state.error}
        </div>
      )}

      <fieldset>
        <legend className="label">I want to…</legend>
        <div className="grid grid-cols-3 gap-2">
          {ROLE_OPTIONS.map((o) => (
            <label
              key={o.id}
              className={cn(
                "cursor-pointer rounded-xl border p-3 text-center transition",
                role === o.id ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-ink-200 hover:border-ink-300",
              )}
            >
              <input type="radio" name="role" value={o.id} checked={role === o.id} onChange={() => setRole(o.id)} className="sr-only" />
              <o.icon className={cn("mx-auto", role === o.id ? "text-brand-700" : "text-ink-400")} size={22} />
              <span className="mt-1 block text-sm font-semibold">{o.title}</span>
              <span className="block text-[11px] leading-tight text-ink-500">{o.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="label">
            Full name
          </label>
          <input id="name" name="name" required className="input" defaultValue={f?.name} autoComplete="name" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="email" className="label">
            Work email
          </label>
          <input id="email" name="email" type="email" required className="input" defaultValue={f?.email} autoComplete="email" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="password" className="label">
            Password
          </label>
          <input id="password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
          <p className="mt-1 text-xs text-ink-500">At least 8 characters.</p>
        </div>

        {role === "MERCHANT" && (
          <div className="sm:col-span-2">
            <label htmlFor="storeName" className="label">
              Store name
            </label>
            <input id="storeName" name="storeName" required className="input" placeholder="e.g. Nordic Home Co." defaultValue={f?.storeName} />
            <p className="mt-1 text-xs text-ink-500">You can change this any time.</p>
          </div>
        )}

        {role === "SUPPLIER" && (
          <>
            <div>
              <label htmlFor="companyName" className="label">
                Company name
              </label>
              <input id="companyName" name="companyName" required className="input" defaultValue={f?.companyName} />
            </div>
            <div>
              <label htmlFor="country" className="label">
                Ships from
              </label>
              <select id="country" name="country" required className="input" defaultValue={f?.country || ""}>
                <option value="" disabled>
                  Select country
                </option>
                {EU_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4 rounded border-ink-300" required />
          <span className="text-ink-600">
            I agree to the{" "}
            <Link href="/legal/terms" className="font-medium text-ink-900 underline" target="_blank">
              Terms of Service
            </Link>{" "}
            and have read the{" "}
            <Link href="/legal/privacy" className="font-medium text-ink-900 underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="marketing" className="mt-0.5 h-4 w-4 rounded border-ink-300" />
          <span className="text-ink-600">Send me product news and tips (optional, unsubscribe any time).</span>
        </label>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending && <Loader2 size={18} className="animate-spin" />}
        {role === "MERCHANT" ? "Create my store" : role === "SUPPLIER" ? "Apply as supplier" : "Create account"}
      </button>
    </form>
  );
}
