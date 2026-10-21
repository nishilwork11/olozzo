import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/rbac";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "@/lib/session";

/**
 * Role-aware entry point. Also re-issues the session token so role changes made by an admin
 * are picked up by the middleware (which only sees the signed token, not the database).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const previous = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const url = new URL(homeForRole(user.role), req.url);
  if (req.nextUrl.searchParams.has("denied") && previous?.role === user.role) {
    url.searchParams.set("error", "Your role does not have access to that area.");
  }

  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_COOKIE, await signSession({ userId: user.id, role: user.role, name: user.name, email: user.email }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
