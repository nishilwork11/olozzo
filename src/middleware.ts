import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_AREAS } from "@/lib/rbac";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
// Platform paths that must never be rewritten to a storefront on a store subdomain
const PLATFORM_PATHS = ["/s/", "/api", "/login", "/register", "/account", "/dashboard", "/onboarding", "/admin", "/merchant", "/supplier", "/legal"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Optional Shopify-style subdomains: urban-nest.olozzo.com/cart → /s/urban-nest/cart
  if (ROOT_DOMAIN) {
    const host = (req.headers.get("host") ?? "").split(":")[0];
    if (host.endsWith(`.${ROOT_DOMAIN}`)) {
      const sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
      if (sub && sub !== "www" && !PLATFORM_PATHS.some((p) => pathname.startsWith(p))) {
        const url = req.nextUrl.clone();
        url.pathname = `/s/${sub}${pathname === "/" ? "" : pathname}`;
        return NextResponse.rewrite(url);
      }
    }
  }

  // Role-based route protection (layouts re-check against the database)
  const area = PROTECTED_AREAS.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`));
  if (!area) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (!area.roles.includes(session.role)) {
    return NextResponse.redirect(new URL("/dashboard?denied=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"],
};
