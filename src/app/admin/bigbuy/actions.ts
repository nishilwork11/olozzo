"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { syncBigBuyTaxonomy } from "@/lib/bigbuy/catalog";
import { bigBuyTestConnection } from "@/lib/bigbuy/client";
import { importBigBuyProduct } from "@/lib/bigbuy/products";
import { syncBigBuyCatalog } from "@/lib/bigbuy/sync";
import { int, str, withFlash } from "@/lib/utils";

export async function testBigBuyConnection() {
  const admin = await requirePermission("bigbuy:manage");
  const res = await bigBuyTestConnection();
  await audit(admin.id, "bigbuy.connection_test", "BigBuyAccount", "default", res.message);
  revalidatePath("/admin/bigbuy");
  redirect(withFlash("/admin/bigbuy", res.ok ? "ok" : "error", res.message));
}

export async function pullBigBuyTaxonomyAction(form: FormData) {
  const admin = await requirePermission("bigbuy:manage");
  const taxonomy = int(form, "taxonomy", 0);
  if (!taxonomy) redirect(withFlash("/admin/bigbuy", "error", "Enter a first-level taxonomy id to pull."));
  try {
    const res = await syncBigBuyTaxonomy(taxonomy);
    await audit(admin.id, "bigbuy.catalog_pull", "BigBuyCatalogItem", String(taxonomy), `Cached ${res.items} products`);
    revalidatePath("/admin/bigbuy");
    revalidatePath("/admin/bigbuy/browse");
    redirect(withFlash("/admin/bigbuy", "ok", `Cached ${res.items} products from taxonomy ${taxonomy}.`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Catalogue pull failed";
    redirect(withFlash("/admin/bigbuy", "error", msg));
  }
}

export async function syncBigBuyNowAction() {
  const admin = await requirePermission("bigbuy:manage");
  const res = await syncBigBuyCatalog();
  await audit(admin.id, "bigbuy.sync", "BigBuyProduct", null, `Checked ${res.checked}, updated ${res.updated}, removed ${res.removed}`);
  revalidatePath("/admin/bigbuy");
  redirect(withFlash("/admin/bigbuy", "ok", `Sync done — checked ${res.checked}, updated ${res.updated}, removed ${res.removed}.`));
}

export async function importBigBuyProductAction(bbSku: string, form: FormData) {
  const admin = await requirePermission("bigbuy:manage");
  const sku = bbSku || str(form, "bbSku");
  const markupRaw = int(form, "markup", 0);
  const res = await importBigBuyProduct(sku, markupRaw > 0 ? { markupPercent: markupRaw } : {});
  const back = "/admin/bigbuy/browse";
  if (!res.ok) redirect(withFlash(back, "error", res.error));
  await audit(admin.id, "bigbuy.product_imported", "Product", res.productId, sku);
  revalidatePath("/admin/bigbuy");
  revalidatePath(back);
  redirect(withFlash("/admin/bigbuy", "ok", "Product imported and published to the shop."));
}
