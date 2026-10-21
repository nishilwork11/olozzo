import "server-only";
import { redirect } from "next/navigation";
import { requirePermission, requireUser } from "./auth";
import { db } from "./db";
import type { Permission } from "./rbac";

/** For merchant pages: the signed-in merchant and their store (or send them to onboarding). */
export async function requireMerchantStore() {
  const user = await requireUser(["MERCHANT"]);
  const store = await db.store.findUnique({ where: { ownerId: user.id } });
  if (!store) redirect("/onboarding");
  return { user, store };
}

/** For merchant server actions: checks the permission and resolves the caller's own store. */
export async function merchantStoreFor(permission: Permission) {
  const user = await requirePermission(permission);
  const store = await db.store.findUnique({ where: { ownerId: user.id } });
  if (!store) throw new Error("You need a store first");
  return { user, store };
}
