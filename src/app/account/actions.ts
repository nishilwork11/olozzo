"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { destroySession, requirePermission, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyReturnRequested } from "@/lib/email/notify";
import { RETURN_WINDOW_DAYS } from "@/lib/orders";
import { str, withFlash } from "@/lib/utils";

const RETURN_REASONS = ["Changed my mind", "Wrong size or fit", "Item not as described", "Arrived damaged or defective", "Received the wrong item", "Other"];

export async function requestReturn(orderId: string, form: FormData) {
  const user = await requirePermission("returns:request");
  const back = `/account/orders/${orderId}`;
  const order = await db.order.findFirst({ where: { id: orderId, customerId: user.id }, include: { returns: true } });
  if (!order) throw new Error("Order not found");

  const reason = str(form, "reason");
  if (!RETURN_REASONS.includes(reason)) redirect(withFlash(back, "error", "Please choose a reason."));
  if (order.paymentStatus !== "PAID" || !["PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)) {
    redirect(withFlash(back, "error", "This order cannot be returned."));
  }
  if (Date.now() - order.createdAt.getTime() > RETURN_WINDOW_DAYS * 86400000) {
    redirect(withFlash(back, "error", "The return window for this order has closed."));
  }
  if (order.returns.some((r) => r.status === "REQUESTED" || r.status === "APPROVED")) {
    redirect(withFlash(back, "error", "You already have an open return request for this order."));
  }

  const ret = await db.returnRequest.create({ data: { orderId, reason, details: str(form, "details").slice(0, 1000) || null } });
  await audit(user.id, "return.requested", "ReturnRequest", ret.id, `${order.number}: ${reason}`);
  await notifyReturnRequested(ret.id);
  revalidatePath(back);
  redirect(withFlash(back, "ok", "Return requested. The store will contact you with return instructions."));
}

export async function updateProfile(form: FormData) {
  const user = await requireUser();
  const name = str(form, "name");
  if (name.length < 2) redirect(withFlash("/account/settings", "error", "Please enter your name."));
  await db.user.update({ where: { id: user.id }, data: { name, marketingOptIn: form.get("marketingOptIn") === "on" } });
  revalidatePath("/account", "layout");
  redirect(withFlash("/account/settings", "ok", "Profile updated."));
}

export async function changePassword(form: FormData) {
  const user = await requireUser();
  const back = "/account/settings";
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await bcrypt.compare(current, record.passwordHash))) redirect(withFlash(back, "error", "Your current password is incorrect."));
  if (next.length < 8) redirect(withFlash(back, "error", "New password must be at least 8 characters."));
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await audit(user.id, "user.password_changed", "User", user.id);
  redirect(withFlash(back, "ok", "Password changed."));
}

/** GDPR Art. 17 — erase the account. Orders are kept (tax law) but unlinked from the user. */
export async function deleteAccount(form: FormData) {
  const user = await requireUser();
  const back = "/account/settings";
  if (str(form, "confirm") !== "DELETE") redirect(withFlash(back, "error", "Type DELETE to confirm."));
  if (user.role !== "CUSTOMER") {
    redirect(withFlash(back, "error", "Business accounts (merchants, suppliers, admins) must contact support to close their account."));
  }
  await audit(null, "user.deleted", "User", user.id, "Customer account deleted on request (GDPR Art. 17)");
  await db.user.delete({ where: { id: user.id } });
  await destroySession();
  redirect("/?ok=" + encodeURIComponent("Your account has been deleted."));
}
