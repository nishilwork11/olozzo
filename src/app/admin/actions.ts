"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { isRole } from "@/lib/rbac";
import { slugify, str, withFlash } from "@/lib/utils";

export async function updateUserRole(userId: string, form: FormData) {
  const admin = await requirePermission("users:manage");
  const role = str(form, "role");
  if (!isRole(role)) redirect(withFlash("/admin/users", "error", "Unknown role."));
  if (userId === admin.id) redirect(withFlash("/admin/users", "error", "You cannot change your own role."));

  const user = await db.user.update({ where: { id: userId }, data: { role } });
  await audit(admin.id, "user.role_changed", "User", userId, `${user.email} → ${role}`);
  revalidatePath("/admin/users");
  redirect(withFlash("/admin/users", "ok", `${user.email} is now ${role.toLowerCase()}.`));
}

export async function setUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED") {
  const admin = await requirePermission("users:manage");
  if (userId === admin.id) redirect(withFlash("/admin/users", "error", "You cannot suspend yourself."));
  const user = await db.user.update({ where: { id: userId }, data: { status } });
  await audit(admin.id, status === "SUSPENDED" ? "user.suspended" : "user.reactivated", "User", userId, user.email);
  revalidatePath("/admin/users");
  redirect(withFlash("/admin/users", "ok", `${user.email} ${status === "SUSPENDED" ? "suspended" : "reactivated"}.`));
}

export async function setSupplierStatus(supplierId: string, status: "APPROVED" | "REJECTED" | "PENDING") {
  const admin = await requirePermission("suppliers:approve");
  const supplier = await db.supplier.update({ where: { id: supplierId }, data: { status } });
  await audit(admin.id, `supplier.${status.toLowerCase()}`, "Supplier", supplierId, supplier.companyName);
  revalidatePath("/admin/suppliers");
  redirect(withFlash("/admin/suppliers", "ok", `${supplier.companyName} marked as ${status.toLowerCase()}.`));
}

export async function toggleProductActive(productId: string) {
  const admin = await requirePermission("products:moderate");
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  await db.product.update({ where: { id: productId }, data: { active: !product.active } });
  await audit(admin.id, product.active ? "product.hidden" : "product.restored", "Product", productId, product.title);
  revalidatePath("/admin/products");
  redirect(withFlash("/admin/products", "ok", `${product.title} ${product.active ? "hidden from all stores" : "restored"}.`));
}

export async function updateStoreAdmin(storeId: string, form: FormData) {
  const admin = await requirePermission("platform:manage");
  const plan = str(form, "plan");
  const published = form.get("published") === "on";
  if (!(plan in PLANS)) redirect(withFlash("/admin/stores", "error", "Unknown plan."));
  const store = await db.store.update({ where: { id: storeId }, data: { plan, published } });
  await audit(admin.id, "store.updated_by_admin", "Store", storeId, `${store.name}: plan ${plan}, ${published ? "published" : "unpublished"}`);
  revalidatePath("/admin/stores");
  redirect(withFlash("/admin/stores", "ok", `${store.name} updated.`));
}

export async function createCategory(form: FormData) {
  const admin = await requirePermission("platform:manage");
  const name = str(form, "name");
  if (name.length < 2) redirect(withFlash("/admin/categories", "error", "Category name is too short."));
  const slug = slugify(name);
  if (await db.category.findFirst({ where: { OR: [{ name }, { slug }] } })) {
    redirect(withFlash("/admin/categories", "error", "That category already exists."));
  }
  const category = await db.category.create({ data: { name, slug } });
  await audit(admin.id, "category.created", "Category", category.id, name);
  revalidatePath("/admin/categories");
  redirect(withFlash("/admin/categories", "ok", `Category “${name}” created.`));
}

export async function deleteCategory(categoryId: string) {
  const admin = await requirePermission("platform:manage");
  const category = await db.category.delete({ where: { id: categoryId } });
  await audit(admin.id, "category.deleted", "Category", categoryId, category.name);
  revalidatePath("/admin/categories");
  redirect(withFlash("/admin/categories", "ok", `Category “${category.name}” deleted. Its products are now uncategorised.`));
}
