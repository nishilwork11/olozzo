import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { can, isRole, type Permission, type Role } from "./rbac";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export async function createSession(user: CurrentUser) {
  const token = await signSession({ userId: user.id, role: user.role, name: user.name, email: user.email });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, re-checked against the database (role changes & suspensions apply immediately). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE" || !isRole(user.role)) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});

/** Require a signed-in user, optionally with one of the given roles. Redirects otherwise. */
export async function requireUser(roles?: readonly Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // /dashboard refreshes the session token (role may have changed) and routes to the right area
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

/** Require a specific permission — used inside server actions. Throws instead of redirecting. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (!can(user.role, permission)) throw new Error(`Forbidden: missing permission ${permission}`);
  return user;
}
