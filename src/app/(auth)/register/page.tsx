import type { Metadata } from "next";
import Link from "next/link";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const initialRole = !OPEN_STORE_ENABLED || role === "customer" ? "CUSTOMER" : role === "supplier" ? "SUPPLIER" : "MERCHANT";
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Create your olozzo account</h1>
      <p className="mt-2 text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
      <RegisterForm initialRole={initialRole} />
    </div>
  );
}
