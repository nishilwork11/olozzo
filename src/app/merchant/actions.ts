"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEuCountry } from "@/lib/eu";
import { merchantStoreFor } from "@/lib/merchant";
import { toCents } from "@/lib/money";
import { refundPayment } from "@/lib/payments";
import { PLANS } from "@/lib/plans";
import { retailFromCost } from "@/lib/pricing";
import { int, slugify, str, withFlash } from "@/lib/utils";

// ── Store ───────────────────────────────────────────────────

export async function createStore(form: FormData) {
  const user = await requirePermission("store:manage");
  if (await db.store.findUnique({ where: { ownerId: user.id } })) redirect("/merchant");
  const name = str(form, "name");
  const country = str(form, "country");
  if (name.length < 2) redirect(withFlash("/onboarding", "error", "Please enter a store name."));
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await db.store.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  const store = await db.store.create({
    data: { ownerId: user.id, name, slug, country: isEuCountry(country) ? country : "DE", supportEmail: user.email },
  });
  await audit(user.id, "store.created", "Store", store.id, name);
  redirect(withFlash("/merchant/catalog", "ok", "Your store is live! Import your first products below."));
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function updateStoreSettings(form: FormData) {
  const { user, store } = await merchantStoreFor("store:manage");
  const name = str(form, "name");
  const slug = slugify(str(form, "slug") || name);
  const accentColor = str(form, "accentColor");
  const shippingRate = toCents(str(form, "shippingRate"));
  const freeOverRaw = str(form, "freeShippingOver");
  const freeShippingOver = freeOverRaw ? toCents(freeOverRaw) : null;
  const markupPercent = int(form, "markupPercent", store.markupPercent);
  const country = str(form, "country");

  const back = "/merchant/settings";
  if (name.length < 2) redirect(withFlash(back, "error", "Store name is too short."));
  if (slug !== store.slug && (await db.store.findUnique({ where: { slug } }))) redirect(withFlash(back, "error", "That store address is already taken."));
  if (!HEX.test(accentColor)) redirect(withFlash(back, "error", "Brand colour must be a hex value like #4f46e5."));
  if (!Number.isFinite(shippingRate) || shippingRate < 0) redirect(withFlash(back, "error", "Invalid shipping rate."));
  if (freeShippingOver !== null && (!Number.isFinite(freeShippingOver) || freeShippingOver < 0)) redirect(withFlash(back, "error", "Invalid free-shipping threshold."));
  if (markupPercent < 0 || markupPercent > 1000) redirect(withFlash(back, "error", "Markup must be between 0% and 1000%."));

  await db.store.update({
    where: { id: store.id },
    data: {
      name,
      slug,
      accentColor,
      shippingRate,
      freeShippingOver,
      markupPercent,
      country: isEuCountry(country) ? country : store.country,
      tagline: str(form, "tagline") || null,
      description: str(form, "description") || null,
      logoUrl: str(form, "logoUrl") || null,
      bannerUrl: str(form, "bannerUrl") || null,
      supportEmail: str(form, "supportEmail") || null,
      priceEnding99: form.get("priceEnding99") === "on",
      published: form.get("published") === "on",
    },
  });
  await audit(user.id, "store.settings_updated", "Store", store.id, name);
  revalidatePath("/merchant", "layout");
  redirect(withFlash(back, "ok", "Store settings saved."));
}

export async function changePlan(plan: string) {
  const { user, store } = await merchantStoreFor("store:manage");
  if (!(plan in PLANS)) redirect(withFlash("/merchant/settings", "error", "Unknown plan."));
  await db.store.update({ where: { id: store.id }, data: { plan } });
  await audit(user.id, "store.plan_changed", "Store", store.id, `${store.plan} → ${plan}`);
  revalidatePath("/merchant/settings");
  redirect(withFlash("/merchant/settings", "ok", `You are now on the ${PLANS[plan as keyof typeof PLANS].name} plan.`));
}

// ── Catalog import ─────────────────────────────────────────

export async function importProduct(productId: string, returnTo: string) {
  const { user, store } = await merchantStoreFor("catalog:import");
  const back = returnTo.startsWith("/merchant") ? returnTo : "/merchant/catalog";
  const product = await db.product.findFirst({ where: { id: productId, active: true, supplier: { status: "APPROVED" } } });
  if (!product) redirect(withFlash(back, "error", "This product is no longer available."));
  if (await db.storeProduct.findUnique({ where: { storeId_productId: { storeId: store.id, productId } } })) {
    redirect(withFlash(back, "error", "Already in your store."));
  }

  const base = slugify(product.title);
  let slug = base;
  for (let i = 2; await db.storeProduct.findUnique({ where: { storeId_slug: { storeId: store.id, slug } } }); i++) slug = `${base}-${i}`;

  const sp = await db.storeProduct.create({
    data: {
      storeId: store.id,
      productId,
      slug,
      title: product.title,
      description: product.description,
      price: retailFromCost(product.costPrice, store.markupPercent, store.priceEnding99),
    },
  });
  await audit(user.id, "product.imported", "StoreProduct", sp.id, product.title);
  revalidatePath("/merchant", "layout");
  redirect(withFlash(back, "ok", `“${product.title}” imported and live in your store.`));
}

// ── Store products ─────────────────────────────────────────

async function ownStoreProduct(id: string) {
  const { user, store } = await merchantStoreFor("store_products:manage");
  const sp = await db.storeProduct.findFirst({ where: { id, storeId: store.id }, include: { product: true } });
  if (!sp) throw new Error("Product not found");
  return { user, store, sp };
}

export async function updateStoreProduct(id: string, form: FormData) {
  const { user, store, sp } = await ownStoreProduct(id);
  const back = `/merchant/products/${id}`;
  const title = str(form, "title");
  const slug = slugify(str(form, "slug") || title);
  const price = toCents(str(form, "price"));
  const compareRaw = str(form, "compareAtPrice");
  const compareAtPrice = compareRaw ? toCents(compareRaw) : null;

  if (title.length < 2) redirect(withFlash(back, "error", "Title is too short."));
  if (!Number.isFinite(price) || price < 1) redirect(withFlash(back, "error", "Please enter a valid price."));
  if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice <= price)) {
    redirect(withFlash(back, "error", "Compare-at price must be higher than the selling price."));
  }
  if (slug !== sp.slug && (await db.storeProduct.findUnique({ where: { storeId_slug: { storeId: store.id, slug } } }))) {
    redirect(withFlash(back, "error", "Another product already uses that URL."));
  }

  await db.storeProduct.update({
    where: { id },
    data: {
      title,
      slug,
      price,
      compareAtPrice,
      description: str(form, "description") || sp.product.description,
      active: form.get("active") === "on",
      featured: form.get("featured") === "on",
    },
  });
  await audit(user.id, "store_product.updated", "StoreProduct", id, `${title} @ ${price}`);
  revalidatePath("/merchant", "layout");
  redirect(withFlash(back, "ok", "Product saved."));
}

export async function toggleStoreProduct(id: string) {
  const { sp } = await ownStoreProduct(id);
  await db.storeProduct.update({ where: { id }, data: { active: !sp.active } });
  revalidatePath("/merchant/products");
  redirect(withFlash("/merchant/products", "ok", `“${sp.title}” ${sp.active ? "unpublished" : "published"}.`));
}

export async function removeStoreProduct(id: string) {
  const { user, sp } = await ownStoreProduct(id);
  await db.storeProduct.delete({ where: { id } });
  await audit(user.id, "store_product.removed", "StoreProduct", id, sp.title);
  revalidatePath("/merchant", "layout");
  redirect(withFlash("/merchant/products", "ok", `“${sp.title}” removed from your store.`));
}

// ── Discounts ──────────────────────────────────────────────

export async function createDiscount(form: FormData) {
  const { user, store } = await merchantStoreFor("discounts:manage");
  const back = "/merchant/discounts";
  const code = str(form, "code").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const type = str(form, "type") === "FIXED" ? "FIXED" : "PERCENT";
  const value = type === "PERCENT" ? int(form, "value") : toCents(str(form, "value"));
  const minSubtotal = str(form, "minSubtotal") ? toCents(str(form, "minSubtotal")) : 0;
  const maxUses = str(form, "maxUses") ? int(form, "maxUses") : null;
  const expiresRaw = str(form, "expiresAt");

  if (code.length < 3) redirect(withFlash(back, "error", "Code must be at least 3 characters (letters, numbers, - or _)."));
  if (!Number.isFinite(value) || value <= 0 || (type === "PERCENT" && value > 100)) redirect(withFlash(back, "error", "Invalid discount value."));
  if (!Number.isFinite(minSubtotal) || minSubtotal < 0) redirect(withFlash(back, "error", "Invalid minimum order value."));
  if (await db.discountCode.findUnique({ where: { storeId_code: { storeId: store.id, code } } })) redirect(withFlash(back, "error", "That code already exists."));

  await db.discountCode.create({
    data: {
      storeId: store.id,
      code,
      type,
      value,
      minSubtotal,
      maxUses: maxUses && maxUses > 0 ? maxUses : null,
      expiresAt: expiresRaw ? new Date(`${expiresRaw}T23:59:59`) : null,
    },
  });
  await audit(user.id, "discount.created", "DiscountCode", null, code);
  revalidatePath(back);
  redirect(withFlash(back, "ok", `Discount ${code} created.`));
}

export async function toggleDiscount(id: string) {
  const { user, store } = await merchantStoreFor("discounts:manage");
  const d = await db.discountCode.findFirst({ where: { id, storeId: store.id } });
  if (!d) throw new Error("Not found");
  await db.discountCode.update({ where: { id }, data: { active: !d.active } });
  await audit(user.id, d.active ? "discount.disabled" : "discount.enabled", "DiscountCode", id, d.code);
  revalidatePath("/merchant/discounts");
  redirect(withFlash("/merchant/discounts", "ok", `${d.code} ${d.active ? "disabled" : "enabled"}.`));
}

export async function deleteDiscount(id: string) {
  const { user, store } = await merchantStoreFor("discounts:manage");
  const d = await db.discountCode.findFirst({ where: { id, storeId: store.id } });
  if (!d) throw new Error("Not found");
  await db.discountCode.delete({ where: { id } });
  await audit(user.id, "discount.deleted", "DiscountCode", id, d.code);
  revalidatePath("/merchant/discounts");
  redirect(withFlash("/merchant/discounts", "ok", `${d.code} deleted.`));
}

// ── Orders, refunds & returns ──────────────────────────────

async function ownOrder(orderId: string) {
  const { user, store } = await merchantStoreFor("store_orders:manage");
  const order = await db.order.findFirst({ where: { id: orderId, storeId: store.id } });
  if (!order) throw new Error("Order not found");
  return { user, store, order };
}

async function performRefund(orderId: string, userId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await refundPayment(order);
  await db.$transaction([
    db.order.update({ where: { id: orderId }, data: { status: "REFUNDED", paymentStatus: "REFUNDED" } }),
    db.supplierOrder.updateMany({ where: { orderId, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "CANCELLED" } }),
  ]);
  await audit(userId, "order.refunded", "Order", orderId, `${order.number} refunded ${order.total} via ${order.paymentProvider}`);
}

export async function refundOrder(orderId: string) {
  const { user, order } = await ownOrder(orderId);
  const back = `/merchant/orders/${orderId}`;
  if (order.paymentStatus !== "PAID") redirect(withFlash(back, "error", "Only paid orders can be refunded."));
  try {
    await performRefund(orderId, user.id);
  } catch (err) {
    redirect(withFlash(back, "error", `Refund failed: ${(err as Error).message}`));
  }
  revalidatePath("/merchant", "layout");
  redirect(withFlash(back, "ok", "Order refunded. Unshipped supplier orders were cancelled."));
}

export async function cancelUnpaidOrder(orderId: string) {
  const { user, order } = await ownOrder(orderId);
  const back = `/merchant/orders/${orderId}`;
  if (order.paymentStatus === "PAID") redirect(withFlash(back, "error", "Paid orders must be refunded instead."));
  await db.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  await audit(user.id, "order.cancelled", "Order", orderId, order.number);
  revalidatePath("/merchant", "layout");
  redirect(withFlash(back, "ok", "Order cancelled."));
}

export async function resolveReturn(returnId: string, decision: "APPROVED" | "REJECTED" | "REFUNDED", form: FormData) {
  const { user, store } = await merchantStoreFor("store_orders:manage");
  const ret = await db.returnRequest.findFirst({ where: { id: returnId, order: { storeId: store.id } }, include: { order: true } });
  if (!ret) throw new Error("Return not found");
  const back = `/merchant/orders/${ret.orderId}`;
  const resolution = str(form, "resolution") || null;

  if (decision === "REFUNDED" && ret.order.paymentStatus === "PAID") {
    try {
      await performRefund(ret.orderId, user.id);
    } catch (err) {
      redirect(withFlash(back, "error", `Refund failed: ${(err as Error).message}`));
    }
  }
  await db.returnRequest.update({ where: { id: returnId }, data: { status: decision, resolution } });
  await audit(user.id, `return.${decision.toLowerCase()}`, "ReturnRequest", returnId, ret.order.number);
  revalidatePath("/merchant", "layout");
  redirect(withFlash(back, "ok", `Return ${decision.toLowerCase()}.`));
}
