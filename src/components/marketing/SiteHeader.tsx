import Link from "next/link";
import { Suspense } from "react";
import { BadgePercent, Gamepad2, LayoutGrid, Package, User, type LucideIcon } from "lucide-react";
import { CartLink, LiveCartLink } from "@/components/shop/CartLink";
import { CategoryMenu, ScrollRow, type MenuCategory } from "@/components/shop/CategoryMenu";
import { MobileCategoriesButton, MobileNav } from "@/components/shop/MobileNav";
import { PromoBar } from "@/components/shop/PromoBar";
import { SearchBar, SearchForm } from "@/components/shop/SearchBar";
import { Logo } from "@/components/ui";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { getCategoryTree, HOUSE_STORE_SLUG, subcategoryLabel, type CategoryNode } from "@/lib/catalog";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { homeForRole } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const DEALS_HREF = "/search?deals=1&sort=discount";
// The account home lists the signed-in shopper's orders (there is no separate /account/orders index page)
export const ORDERS_HREF = "/account";
const QUICK_LINKS = 10;
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

/** Square, small Unsplash rendition for the round menu tiles (other image hosts are used as they are). */
function tileImage(src: string | null): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    if (url.hostname !== "images.unsplash.com") return src;
    for (const [key, value] of Object.entries({ w: "160", h: "160", fit: "crop", q: "70" })) url.searchParams.set(key, value);
    return url.toString();
  } catch {
    return src;
  }
}

/** Only what the menus need, with subcategory names already shortened (catalog helpers are server-only). */
function toMenu(tree: CategoryNode[]): MenuCategory[] {
  return tree.map((c) => ({
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    productCount: c.productCount,
    children: c.children.map((s) => ({ slug: s.slug, label: subcategoryLabel(s.name, c.name), image: tileImage(s.image) })),
  }));
}

function HeaderLink({ href, icon: Icon, label, className }: { href: string; icon: LucideIcon; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-full p-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-900 lg:px-3",
        FOCUS_RING,
        className,
      )}
    >
      <Icon size={22} aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </Link>
  );
}

// Colour and weight are set per chip (never overridden), so no two utilities of a kind compete
const chipBase = cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition", FOCUS_RING);
const chip = cn(chipBase, "font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-800");
const dealsChip = cn(chipBase, "font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-800");
const allCategoriesChip = cn(chipBase, "bg-brand-600 font-semibold text-white hover:bg-brand-700");

/**
 * Shop header (Temu/DHgate style): benefits bar, logo + search + account/cart, and a category row with
 * the "All categories" mega menu. Inside a store's <CartProvider> pass `liveCart` so the cart badge
 * follows the cart as it changes.
 */
export async function SiteHeader({ liveCart = false }: { liveCart?: boolean } = {}) {
  if (OPEN_STORE_ENABLED) return <PlatformHeader user={await getCurrentUser()} />;

  const [user, tree] = await Promise.all([getCurrentUser(), getCategoryTree()]);
  const menu = toMenu(tree);
  const quick = tree.slice(0, QUICK_LINKS);
  // Shoppers' account home is their order list, so they get one "Orders & Account" link; staff roles get
  // their dashboard plus a separate link to their own orders
  const home = user ? homeForRole(user.role) : null;
  const account =
    user && home
      ? {
          name: user.name.split(" ")[0] || user.name,
          href: home,
          label: home === ORDERS_HREF ? "Orders & Account" : user.role === "CUSTOMER" ? "Account" : "Dashboard",
          ordersHref: home === ORDERS_HREF ? null : ORDERS_HREF,
        }
      : null;
  const cartHref = `/s/${HOUSE_STORE_SLUG}/cart`;

  const quickLinks = (
    <>
      <Link href={DEALS_HREF} className={dealsChip}>
        <BadgePercent size={16} aria-hidden="true" />
        Deals
      </Link>
      {quick.map((c) => (
        <Link key={c.slug} href={`/c/${c.slug}`} className={chip}>
          {c.name}
        </Link>
      ))}
    </>
  );

  return (
    <>
      <PromoBar />
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:h-[72px] lg:gap-8">
          <MobileNav categories={menu} account={account} cartHref={cartHref} dealsHref={DEALS_HREF} />
          <Logo className="shrink-0" />
          <div className="hidden min-w-0 max-w-2xl flex-1 lg:block">
            <Suspense fallback={<SearchForm />}>
              <SearchBar />
            </Suspense>
          </div>
          <nav aria-label="Shortcuts" className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <HeaderLink href="/games" icon={Gamepad2} label="Games" />
            {account?.ordersHref && <HeaderLink href={account.ordersHref} icon={Package} label="Orders" className="hidden md:flex" />}
            <HeaderLink href={account ? account.href : "/login"} icon={User} label={account ? account.label : "Sign in"} />
            {liveCart ? <LiveCartLink /> : <CartLink storeSlug={HOUSE_STORE_SLUG} />}
          </nav>
        </div>

        <div className="px-4 pb-3 sm:px-6 lg:hidden">
          <Suspense fallback={<SearchForm />}>
            <SearchBar />
          </Suspense>
        </div>

        <div className="relative hidden border-t border-ink-100 lg:block">
          <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:px-6">
            <CategoryMenu categories={menu} />
            <nav aria-label="Popular categories" className="min-w-0 flex-1">
              {/* Padding leaves room for the focus rings inside the scroller */}
              <ScrollRow innerClassName="gap-1 p-1">{quickLinks}</ScrollRow>
            </nav>
          </div>
        </div>
      </header>

      {/* Phones and tablets: the same quick links, scrolling away with the page to keep the sticky bar short */}
      <nav aria-label="Popular categories" className="border-b border-ink-100 bg-white lg:hidden">
        <ScrollRow innerClassName="gap-1 px-2.5 py-2 sm:px-4">
          {menu.length > 0 && (
            <MobileCategoriesButton className={allCategoriesChip}>
              <LayoutGrid size={16} aria-hidden="true" />
              All categories
            </MobileCategoriesButton>
          )}
          {quickLinks}
        </ScrollRow>
      </nav>
    </>
  );
}

// ── Platform mode (OPEN_STORE_ENABLED): the marketing header for merchants and suppliers ──

const PLATFORM_NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#suppliers", label: "Suppliers" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/explore", label: "Explore stores" },
];

function PlatformHeader({ user }: { user: CurrentUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-ink-600 md:flex">
            {PLATFORM_NAV.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-ink-900">
                {l.label}
              </Link>
            ))}
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
