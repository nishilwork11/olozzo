"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { cjTestConnection } from "@/lib/cj/client";
import { importCjProduct } from "@/lib/cj/products";
import { int, withFlash } from "@/lib/utils";

export async function testCjConnection() {
  const admin = await requirePermission("cj:manage");
  const res = await cjTestConnection();
  await audit(admin.id, "cj.connection_test", "CjAccount", "default", res.message);
  revalidatePath("/admin/cj");
  redirect(withFlash("/admin/cj", res.ok ? "ok" : "error", res.message));
}

export async function importCjProductAction(pid: string, form: FormData) {
  const admin = await requirePermission("cj:manage");
  const markupRaw = int(form, "markup", 0);
  const res = await importCjProduct(pid, markupRaw > 0 ? { markupPercent: markupRaw } : {});
  const back = `/admin/cj/browse`;
  if (!res.ok) redirect(withFlash(back, "error", res.error));
  await audit(admin.id, "cj.product_imported", "Product", res.productId, pid);
  revalidatePath("/admin/cj");
  revalidatePath(back);
  redirect(withFlash("/admin/cj", "ok", "Product imported and published to the shop."));
}
