"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { isRole } from "@/lib/rbac";
import { slugify, str, withFlash } from "@/lib/utils";
import { deleteBlocker, isShopIcon } from "./categories/helpers";

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

// ── Categories ─────────────────────────────────────────────
// Two levels, like Temu/DHgate: top-level categories and their subcategories (Category in prisma/schema.prisma).

const CATEGORIES_PATH = "/admin/categories";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CategoryInput = { name: string; slug: string; icon: string | null; parentId: string | null; position: number | null };

/** Reads and checks the category form; redirects back to `back` with a message when something is wrong. */
async function readCategoryForm(form: FormData, back: string, current?: { id: string; icon: string | null }): Promise<CategoryInput> {
  function fail(message: string): never {
    redirect(withFlash(back, "error", message));
  }
  const name = str(form, "name").replace(/\s+/g, " ");
  const slug = str(form, "slug").toLowerCase() || slugify(name);
  const icon = str(form, "icon") || null;
  const parentId = str(form, "parentId") || null;
  const positionText = str(form, "position");
  const position = positionText === "" ? null : Number(positionText);

  if (name.length < 2 || name.length > 60) fail("The name must be 2–60 characters long.");
  if (!SLUG_RE.test(slug) || slug.length > 60) fail("The slug can only use lowercase letters, numbers and single hyphens (60 characters at most).");
  // An icon that is already saved may stay, even if the shop can't draw it yet
  if (icon && icon !== current?.icon && !isShopIcon(icon)) {
    fail(`The shop can't show the icon “${icon}”. Use one that is already in use (e.g. Shirt, Gem, PawPrint) or leave it empty.`);
  }
  if (position !== null && (!Number.isInteger(position) || position < 0 || position > 9999)) fail("Position must be a whole number from 0 to 9999.");

  const clash = await db.category.findFirst({
    where: { OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }], ...(current ? { NOT: { id: current.id } } : {}) },
    select: { name: true, slug: true },
  });
  if (clash) fail(clash.slug === slug ? `The slug “${slug}” is already used by “${clash.name}”.` : `There is already a category called “${clash.name}”.`);

  if (parentId) {
    if (parentId === current?.id) fail("A category can't be its own parent.");
    const parent = await db.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) fail("The chosen parent category no longer exists.");
    if (parent.parentId) fail("Choose a top-level category as the parent: categories have two levels.");
  }
  return { name, slug, icon, parentId, position };
}

/** After the last category with the same parent. */
async function nextCategoryPosition(parentId: string | null): Promise<number> {
  const { _max } = await db.category.aggregate({ where: { parentId }, _max: { position: true } });
  return (_max.position ?? -1) + 1;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function revalidateCategories() {
  revalidateTag("catalog"); // the shop's cached category tree (src/lib/catalog.ts)
  revalidatePath("/", "layout"); // menus, category pages and the supplier and merchant category pickers
}

export async function createCategory(form: FormData) {
  const admin = await requirePermission("platform:manage");
  const input = await readCategoryForm(form, CATEGORIES_PATH);
  const position = input.position ?? (await nextCategoryPosition(input.parentId));
  const category = await db.category.create({ data: { ...input, position } }).catch((err: unknown) => {
    if (isUniqueViolation(err)) redirect(withFlash(CATEGORIES_PATH, "error", "That name or slug was just taken. Please try another."));
    throw err;
  });
  await audit(admin.id, "category.created", "Category", category.id, `${category.name} (${category.slug})`);
  revalidateCategories();
  redirect(withFlash(CATEGORIES_PATH, "ok", `Category “${category.name}” created.`));
}

export async function updateCategory(categoryId: string, form: FormData) {
  const admin = await requirePermission("platform:manage");
  const back = `${CATEGORIES_PATH}?edit=${encodeURIComponent(categoryId)}`;
  const current = await db.category.findUnique({
    where: { id: categoryId },
    select: { id: true, icon: true, parentId: true, position: true, _count: { select: { children: true } } },
  });
  if (!current) redirect(withFlash(CATEGORIES_PATH, "error", "That category no longer exists."));
  const input = await readCategoryForm(form, back, current);
  if (input.parentId && current._count.children > 0) {
    redirect(withFlash(back, "error", "This category has subcategories, so it has to stay top level (categories have two levels)."));
  }
  // Keep its place, or go last when it moves to another parent
  const position = input.position ?? (input.parentId === current.parentId ? current.position : await nextCategoryPosition(input.parentId));
  const category = await db.category.update({ where: { id: categoryId }, data: { ...input, position } }).catch((err: unknown) => {
    if (isUniqueViolation(err)) redirect(withFlash(back, "error", "That name or slug was just taken. Please try another."));
    throw err;
  });
  await audit(admin.id, "category.updated", "Category", categoryId, `${category.name} (${category.slug})`);
  revalidateCategories();
  redirect(withFlash(CATEGORIES_PATH, "ok", `Category “${category.name}” saved.`));
}

export async function deleteCategory(categoryId: string) {
  const admin = await requirePermission("platform:manage");
  const category = await db.category.findUnique({ where: { id: categoryId }, select: { name: true, _count: { select: { products: true, children: true } } } });
  if (!category) redirect(withFlash(CATEGORIES_PATH, "error", "That category no longer exists."));
  // Only empty categories can go, so no product ever loses its category (checked again in the delete itself)
  const blocker = deleteBlocker(category._count.products, category._count.children);
  const { count } = blocker
    ? { count: 0 }
    : await db.category.deleteMany({ where: { id: categoryId, products: { none: {} }, children: { none: {} } } });
  if (!count) {
    redirect(withFlash(CATEGORIES_PATH, "error", `“${category.name}” can't be deleted while ${blocker ?? "it has products or subcategories"}. Only empty categories can be deleted.`));
  }
  await audit(admin.id, "category.deleted", "Category", categoryId, category.name);
  revalidateCategories();
  redirect(withFlash(CATEGORIES_PATH, "ok", `Category “${category.name}” deleted.`));
}
