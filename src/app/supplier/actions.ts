"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { trackingUrlFor } from "@/lib/carriers";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEuCountry } from "@/lib/eu";
import { toCents } from "@/lib/money";
import { syncOrderStatus } from "@/lib/orders";
import { supplierFor } from "@/lib/supplier";
import { int, slugify, str, withFlash } from "@/lib/utils";

export type FormState = { error?: string } | undefined;

// ── Profile ────────────────────────────────────────────────

export async function saveProfile(form: FormData) {
  const user = await requirePermission("supplier_products:manage");
  const companyName = str(form, "companyName");
  const country = str(form, "country");
  const back = "/supplier/profile";
  if (companyName.length < 2) redirect(withFlash(back, "error", "Please enter your company name."));
  if (!isEuCountry(country)) redirect(withFlash(back, "error", "Please choose an EU ships-from country."));

  const data = {
    companyName,
    country,
    vatNumber: str(form, "vatNumber").toUpperCase().replace(/\s/g, "") || null,
    description: str(form, "description") || null,
    website: str(form, "website") || null,
    processingDays: Math.min(14, Math.max(0, int(form, "processingDays", 2))),
  };
  const supplier = await db.supplier.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
  await audit(user.id, "supplier.profile_saved", "Supplier", supplier.id, companyName);
  revalidatePath("/supplier", "layout");
  redirect(withFlash(back, "ok", "Profile saved."));
}

// ── Products ───────────────────────────────────────────────

const variantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Every variant needs a name").max(60),
  sku: z.string().max(60).optional().default(""),
  cost: z.string(),
  stock: z.coerce.number().int().min(0).max(1_000_000),
});

function parseProductForm(form: FormData) {
  const images = str(form, "images")
    .split(/\s*\n\s*/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
  let variantsRaw: unknown = [];
  try {
    variantsRaw = JSON.parse(str(form, "variants") || "[]");
  } catch {
    return { error: "Variants could not be read." } as const;
  }
  const variants = z.array(variantSchema).min(1, "Add at least one variant").max(100).safeParse(variantsRaw);
  if (!variants.success) return { error: variants.error.issues[0]?.message ?? "Invalid variants." } as const;

  const title = str(form, "title");
  const sku = str(form, "sku").toUpperCase() || slugify(title).toUpperCase().slice(0, 12);
  const costPrice = toCents(str(form, "costPrice"));
  const suggestedPrice = toCents(str(form, "suggestedPrice"));
  const shippingCost = toCents(str(form, "shippingCost") || "0");
  const shippingDaysMin = int(form, "shippingDaysMin", 2);
  const shippingDaysMax = int(form, "shippingDaysMax", 5);

  if (title.length < 3) return { error: "Title must be at least 3 characters." } as const;
  if (str(form, "description").length < 20) return { error: "Please write a description of at least 20 characters." } as const;
  if (images.length === 0) return { error: "Add at least one image URL (https://…)." } as const;
  if (!Number.isFinite(costPrice) || costPrice <= 0) return { error: "Enter a valid wholesale cost." } as const;
  if (!Number.isFinite(suggestedPrice) || suggestedPrice <= costPrice) return { error: "Recommended retail price must be higher than cost." } as const;
  if (!Number.isFinite(shippingCost) || shippingCost < 0) return { error: "Enter a valid shipping cost." } as const;
  if (shippingDaysMin < 0 || shippingDaysMax < shippingDaysMin) return { error: "Check the delivery time range." } as const;

  const parsedVariants = variants.data.map((v, i) => {
    const vCost = v.cost.trim() ? toCents(v.cost) : costPrice;
    return { id: v.id, name: v.name.trim(), sku: v.sku?.trim() || `${sku}-${i + 1}`, costPrice: vCost, stock: v.stock, position: i };
  });
  if (parsedVariants.some((v) => !Number.isFinite(v.costPrice) || v.costPrice <= 0)) return { error: "Each variant needs a valid cost." } as const;

  return {
    data: {
      title,
      sku,
      description: str(form, "description"),
      categoryId: str(form, "categoryId") || null,
      images: JSON.stringify(images),
      costPrice,
      suggestedPrice,
      shippingCost,
      shippingDaysMin,
      shippingDaysMax,
      weightGrams: Math.max(0, int(form, "weightGrams", 500)),
      active: form.get("active") === "on",
    },
    variants: parsedVariants,
  } as const;
}

export async function createProduct(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, supplier } = await supplierFor("supplier_products:manage");
  const parsed = parseProductForm(form);
  if ("error" in parsed) return { error: parsed.error };

  const product = await db.product.create({
    data: {
      ...parsed.data,
      supplierId: supplier.id,
      variants: { create: parsed.variants.map(({ id: _id, ...v }) => v) },
    },
  });
  await audit(user.id, "product.created", "Product", product.id, product.title);
  revalidatePath("/supplier", "layout");
  redirect(withFlash("/supplier/products", "ok", `“${product.title}” created${supplier.status === "APPROVED" ? " and visible to merchants" : " — visible to merchants once your account is approved"}.`));
}

export async function updateProduct(productId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, supplier } = await supplierFor("supplier_products:manage");
  const existing = await db.product.findFirst({ where: { id: productId, supplierId: supplier.id }, include: { variants: true } });
  if (!existing) return { error: "Product not found." };
  const parsed = parseProductForm(form);
  if ("error" in parsed) return { error: parsed.error };

  const keepIds = new Set(parsed.variants.map((v) => v.id).filter(Boolean) as string[]);
  const removed = existing.variants.filter((v) => !keepIds.has(v.id));

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: parsed.data });
    // Variants that appear in past orders are kept (with stock 0) so order history stays intact
    for (const v of removed) {
      const used = await tx.orderItem.count({ where: { variantId: v.id } });
      if (used) await tx.productVariant.update({ where: { id: v.id }, data: { stock: 0, position: 999 } });
      else await tx.productVariant.delete({ where: { id: v.id } });
    }
    for (const { id, ...v } of parsed.variants) {
      if (id && existing.variants.some((ev) => ev.id === id)) await tx.productVariant.update({ where: { id }, data: v });
      else await tx.productVariant.create({ data: { ...v, productId } });
    }
  });
  await audit(user.id, "product.updated", "Product", productId, parsed.data.title);
  revalidatePath("/supplier", "layout");
  redirect(withFlash(`/supplier/products/${productId}`, "ok", "Product saved. Changes are live in every store that sells it."));
}

export async function toggleSupplierProduct(productId: string) {
  const { user, supplier } = await supplierFor("supplier_products:manage");
  const p = await db.product.findFirst({ where: { id: productId, supplierId: supplier.id } });
  if (!p) throw new Error("Product not found");
  await db.product.update({ where: { id: productId }, data: { active: !p.active } });
  await audit(user.id, p.active ? "product.deactivated" : "product.activated", "Product", productId, p.title);
  revalidatePath("/supplier/products");
  redirect(withFlash("/supplier/products", "ok", `“${p.title}” ${p.active ? "deactivated — hidden from all stores" : "activated"}.`));
}

export async function deleteSupplierProduct(productId: string) {
  const { user, supplier } = await supplierFor("supplier_products:manage");
  const p = await db.product.findFirst({ where: { id: productId, supplierId: supplier.id }, include: { _count: { select: { orderItems: true } } } });
  if (!p) throw new Error("Product not found");
  if (p._count.orderItems > 0) {
    await db.product.update({ where: { id: productId }, data: { active: false } });
    await audit(user.id, "product.archived", "Product", productId, p.title);
    revalidatePath("/supplier/products");
    redirect(withFlash("/supplier/products", "ok", `“${p.title}” has order history, so it was archived instead of deleted.`));
  }
  await db.product.delete({ where: { id: productId } });
  await audit(user.id, "product.deleted", "Product", productId, p.title);
  revalidatePath("/supplier/products");
  redirect(withFlash("/supplier/products", "ok", `“${p.title}” deleted.`));
}

// ── CSV bulk import ────────────────────────────────────────

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export async function importCsv(form: FormData) {
  const { user, supplier } = await supplierFor("supplier_products:manage");
  const back = "/supplier/import";
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(withFlash(back, "error", "Please choose a CSV file."));
  if (file.size > 2_000_000) redirect(withFlash(back, "error", "File is too large (max 2 MB)."));

  const rows = parseCsv((await file.text()).replace(/^﻿/, ""));
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const required = ["title", "description", "cost", "rrp", "stock", "image"];
  const missing = required.filter((r) => !header.includes(r));
  if (missing.length) redirect(withFlash(back, "error", `Missing column(s): ${missing.join(", ")}`));

  const categories = await db.category.findMany();
  const col = (r: string[], name: string) => (header.indexOf(name) >= 0 ? (r[header.indexOf(name)] ?? "").trim() : "");
  let created = 0;
  const errors: string[] = [];

  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const title = col(r, "title");
    const cost = toCents(col(r, "cost"));
    const rrp = toCents(col(r, "rrp"));
    const images = col(r, "image").split("|").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
    if (title.length < 3 || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(rrp) || rrp <= cost || images.length === 0) {
      errors.push(`line ${line}`);
      continue;
    }
    const categoryName = col(r, "category").toLowerCase();
    const category = categories.find((c) => c.name.toLowerCase() === categoryName || c.slug === categoryName);
    const sku = (col(r, "sku") || slugify(title).slice(0, 12)).toUpperCase();
    const variantNames = col(r, "variants").split("|").map((s) => s.trim()).filter(Boolean);
    const stock = Math.max(0, parseInt(col(r, "stock"), 10) || 0);
    await db.product.create({
      data: {
        supplierId: supplier.id,
        title,
        description: col(r, "description") || title,
        sku,
        images: JSON.stringify(images),
        costPrice: cost,
        suggestedPrice: rrp,
        shippingCost: Math.max(0, toCents(col(r, "shipping") || "0") || 0),
        shippingDaysMin: parseInt(col(r, "days_min"), 10) || 2,
        shippingDaysMax: parseInt(col(r, "days_max"), 10) || 5,
        categoryId: category?.id ?? null,
        variants: {
          create: (variantNames.length ? variantNames : ["Default"]).map((name, vi) => ({
            name,
            sku: `${sku}-${vi + 1}`,
            costPrice: cost,
            stock,
            position: vi,
          })),
        },
      },
    });
    created++;
  }

  await audit(user.id, "product.csv_import", "Product", null, `${created} created, ${errors.length} skipped`);
  revalidatePath("/supplier", "layout");
  const msg = `${created} product${created === 1 ? "" : "s"} imported.${errors.length ? ` Skipped invalid rows: ${errors.slice(0, 10).join(", ")}${errors.length > 10 ? "…" : ""}` : ""}`;
  redirect(withFlash(created ? "/supplier/products" : back, created ? "ok" : "error", msg));
}

// ── Fulfilment ─────────────────────────────────────────────

async function ownFulfillment(id: string) {
  const { user, supplier } = await supplierFor("fulfillment:update");
  const f = await db.supplierOrder.findFirst({ where: { id, supplierId: supplier.id }, include: { order: true } });
  if (!f) throw new Error("Fulfilment not found");
  return { user, f };
}

export async function acceptFulfillment(id: string) {
  const { user, f } = await ownFulfillment(id);
  if (f.status === "PENDING") {
    await db.supplierOrder.update({ where: { id }, data: { status: "ACCEPTED" } });
    await audit(user.id, "fulfillment.accepted", "SupplierOrder", id, f.order.number);
  }
  revalidatePath("/supplier", "layout");
  redirect(withFlash("/supplier/orders", "ok", `${f.order.number} accepted — pack and ship it within your processing time.`));
}

export async function shipFulfillment(id: string, form: FormData) {
  const { user, f } = await ownFulfillment(id);
  const carrier = str(form, "carrier");
  const trackingNumber = str(form, "trackingNumber").replace(/\s/g, "");
  if (!carrier || trackingNumber.length < 4) redirect(withFlash("/supplier/orders", "error", "Enter the carrier and a valid tracking number."));
  if (f.status === "CANCELLED") redirect(withFlash("/supplier/orders", "error", "This order was cancelled."));

  await db.supplierOrder.update({
    where: { id },
    data: {
      status: "SHIPPED",
      carrier,
      trackingNumber,
      trackingUrl: str(form, "trackingUrl") || trackingUrlFor(carrier, trackingNumber),
      shippedAt: new Date(),
    },
  });
  await syncOrderStatus(f.orderId);
  await audit(user.id, "fulfillment.shipped", "SupplierOrder", id, `${f.order.number} · ${carrier} ${trackingNumber}`);
  revalidatePath("/supplier", "layout");
  redirect(withFlash("/supplier/orders", "ok", `${f.order.number} marked as shipped. The customer can now track the parcel.`));
}

export async function markDelivered(id: string) {
  const { user, f } = await ownFulfillment(id);
  if (f.status !== "SHIPPED") redirect(withFlash("/supplier/orders", "error", "Only shipped orders can be marked delivered."));
  await db.supplierOrder.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  await syncOrderStatus(f.orderId);
  await audit(user.id, "fulfillment.delivered", "SupplierOrder", id, f.order.number);
  revalidatePath("/supplier", "layout");
  redirect(withFlash("/supplier/orders?status=DELIVERED", "ok", `${f.order.number} marked as delivered.`));
}

