import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { createStore } from "@/app/merchant/actions";
import { SubmitButton } from "@/components/client";
import { Flash, Logo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EU_COUNTRIES } from "@/lib/eu";

export const metadata: Metadata = { title: "Create your store" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["MERCHANT"]);
  if (await db.store.findUnique({ where: { ownerId: user.id } })) redirect("/merchant");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4">
      <Logo className="mb-8" />
      <div className="card w-full max-w-md p-8">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <Store size={24} />
        </span>
        <h1 className="mt-5 text-2xl font-bold">Create your store</h1>
        <p className="mt-1 text-sm text-ink-500">Hi {user.name.split(" ")[0]}, let&apos;s get your dropshipping store online.</p>
        <div className="mt-5">
          <Flash error={error} />
        </div>
        <form action={createStore} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Store name</label>
            <input id="name" name="name" required minLength={2} className="input" placeholder="e.g. Nordic Home Co." />
          </div>
          <div>
            <label className="label" htmlFor="country">Business country</label>
            <select id="country" name="country" defaultValue="DE" className="input">
              {EU_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <SubmitButton className="btn btn-primary btn-lg w-full" pendingText="Creating…">Launch my store</SubmitButton>
        </form>
      </div>
    </div>
  );
}
