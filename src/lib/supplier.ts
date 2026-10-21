import "server-only";
import { redirect } from "next/navigation";
import { requirePermission, requireUser } from "./auth";
import { db } from "./db";
import type { Permission } from "./rbac";

/** For supplier pages: the signed-in supplier and their company profile (or send them to set it up). */
export async function requireSupplier() {
  const user = await requireUser(["SUPPLIER"]);
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) redirect("/supplier/profile");
  return { user, supplier };
}

/** For supplier server actions: checks the permission and resolves the caller's own supplier record. */
export async function supplierFor(permission: Permission) {
  const user = await requirePermission(permission);
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) throw new Error("Complete your supplier profile first");
  return { user, supplier };
}
