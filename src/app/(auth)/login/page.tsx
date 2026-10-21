import type { Metadata } from "next";
import Link from "next/link";
import { demoPaymentsEnabled } from "@/lib/payments";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@olozzo.com" },
  { label: "Merchant", email: "merchant@olozzo.com" },
  { label: "Supplier", email: "supplier@olozzo.com" },
  { label: "Customer", email: "customer@olozzo.com" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-ink-500">
        New to olozzo?{" "}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
      <LoginForm next={next ?? ""} />

      {demoPaymentsEnabled() && (
        <div className="mt-10 rounded-xl border border-dashed border-ink-300 bg-ink-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Demo accounts · password Demo1234!</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <span className="text-ink-500">{a.label}:</span> <span className="font-mono text-xs">{a.email}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
