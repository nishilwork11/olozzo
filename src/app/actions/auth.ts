"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEuCountry } from "@/lib/eu";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { homeForRole, isRole } from "@/lib/rbac";
import { slugify, str } from "@/lib/utils";

export type AuthState = { error?: string; fields?: Record<string, string> } | undefined;

function safeNext(next: string): string | null {
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", fields: { email } };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Invalid email or password.", fields: { email } };
  }
  if (user.status !== "ACTIVE") return { error: "This account has been suspended. Please contact support.", fields: { email } };
  if (!isRole(user.role)) return { error: "This account has an invalid role." };

  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect(safeNext(str(form, "next")) ?? homeForRole(user.role));
}

const registerSchema = z
  .object({
    name: z.string().min(2, "Please enter your full name.").max(80),
    email: z.string().email("Please enter a valid email address.").max(160),
    password: z.string().min(8, "Password must be at least 8 characters.").max(100),
    role: z.enum(["CUSTOMER", "MERCHANT", "SUPPLIER"]),
    storeName: z.string().max(60).optional(),
    companyName: z.string().max(100).optional(),
    country: z.string().optional(),
    terms: z.literal("on", { errorMap: () => ({ message: "Please accept the terms and privacy policy." }) }),
    marketing: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "MERCHANT" && (!v.storeName || v.storeName.trim().length < 2)) {
      ctx.addIssue({ code: "custom", message: "Please choose a name for your store.", path: ["storeName"] });
    }
    if (v.role === "SUPPLIER") {
      if (!v.companyName || v.companyName.trim().length < 2) {
        ctx.addIssue({ code: "custom", message: "Please enter your company name.", path: ["companyName"] });
      }
      if (!v.country || !isEuCountry(v.country)) {
        ctx.addIssue({ code: "custom", message: "Please select the EU country you ship from.", path: ["country"] });
      }
    }
  });

async function uniqueStoreSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await db.store.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function registerAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(
    ["name", "email", "password", "role", "storeName", "companyName", "country", "terms", "marketing"].map((k) => [
      k,
      form.get(k) === null ? undefined : String(form.get(k)).trim(),
    ]),
  );
  const fields = { name: raw.name ?? "", email: raw.email ?? "", role: raw.role ?? "", storeName: raw.storeName ?? "", companyName: raw.companyName ?? "", country: raw.country ?? "" };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form.", fields };
  const data = parsed.data;
  const email = data.email.toLowerCase();
  if (!OPEN_STORE_ENABLED && data.role !== "CUSTOMER") {
    return { error: "Store and supplier sign-ups are closed. You can create a customer account.", fields };
  }

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "An account with this email already exists. Try signing in.", fields };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await db.user.create({
    data: {
      email,
      name: data.name,
      passwordHash,
      role: data.role,
      marketingOptIn: data.marketing === "on",
      ...(data.role === "MERCHANT"
        ? { store: { create: { name: data.storeName!.trim(), slug: await uniqueStoreSlug(data.storeName!), supportEmail: email } } }
        : {}),
      ...(data.role === "SUPPLIER"
        ? { supplier: { create: { companyName: data.companyName!.trim(), country: data.country! } } }
        : {}),
    },
  });
  await audit(user.id, "user.registered", "User", user.id, `Registered as ${data.role}`);

  await createSession({ id: user.id, email: user.email, name: user.name, role: data.role });
  redirect(
    data.role === "MERCHANT"
      ? "/merchant?ok=" + encodeURIComponent("Welcome to olozzo! Your store is live — import your first products from the catalog.")
      : data.role === "SUPPLIER"
        ? "/supplier?ok=" + encodeURIComponent("Application received. You can add products now; they become visible to merchants once an admin approves your account.")
        : homeForRole(data.role),
  );
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
