import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 text-sm font-semibold uppercase tracking-widest text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">This page could not be found</h1>
      <p className="mt-3 text-ink-500">The store or product may have moved, or is no longer available.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn btn-dark">Go home</Link>
        <Link href="/explore" className="btn btn-secondary">Explore stores</Link>
      </div>
    </div>
  );
}
