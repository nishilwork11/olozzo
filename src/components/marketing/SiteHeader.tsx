import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/rbac";
import { Logo } from "@/components/ui";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-ink-600 md:flex">
            <Link href="/#how-it-works" className="hover:text-ink-900">
              How it works
            </Link>
            <Link href="/#features" className="hover:text-ink-900">
              Features
            </Link>
            <Link href="/#suppliers" className="hover:text-ink-900">
              Suppliers
            </Link>
            <Link href="/#pricing" className="hover:text-ink-900">
              Pricing
            </Link>
            <Link href="/explore" className="hover:text-ink-900">
              Explore stores
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href={homeForRole(user.role)} className="btn btn-dark">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary">
                Start free trial
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
