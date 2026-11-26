import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Guest order links. A random token goes into the customer's order-page link (and the payment return URL);
// only its SHA-256 hash is stored, so a database leak does not leak working links.
// Emails are written later (often from a webhook), when that token is no longer known: their links carry a
// signature of the order id made with AUTH_SECRET instead, which is not stored anywhere either.

export function newOrderAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashOrderAccessToken(token) };
}

export function hashOrderAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time check of a token from a URL against the stored hash. */
export function orderTokenMatches(storedHash: string | null | undefined, token: string | null | undefined): boolean {
  if (!storedHash || !token || token.length > 128) return false;
  const given = Buffer.from(hashOrderAccessToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** The token in an order link sent by email. Null when AUTH_SECRET is not set (the link then needs a sign-in). */
export function orderEmailToken(orderId: string, secret = process.env.AUTH_SECRET): string | null {
  if (!secret) return null;
  return createHmac("sha256", secret).update(`order-email:${orderId}`).digest("base64url");
}

export function orderEmailTokenMatches(orderId: string, token: string | null | undefined, secret = process.env.AUTH_SECRET): boolean {
  const expected = orderEmailToken(orderId, secret);
  if (!expected || !token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

type Viewer = { id: string; role: string } | null;

/**
 * Who may see an order's details (name, address, items): the customer who placed it while signed in,
 * anyone holding its link token (from checkout or from an email), the store's owner and platform admins.
 */
export function canViewOrder(
  order: { id: string; customerId: string | null; accessTokenHash: string | null; store: { ownerId: string } },
  viewer: Viewer,
  token: string | null | undefined,
): boolean {
  if (viewer?.role === "ADMIN") return true;
  if (viewer && order.customerId === viewer.id) return true;
  if (viewer && order.store.ownerId === viewer.id) return true;
  return orderTokenMatches(order.accessTokenHash, token) || orderEmailTokenMatches(order.id, token);
}

/** The customer-facing order page, with the token when there is one. */
export function orderPagePath(storeSlug: string, orderId: string, token?: string | null): string {
  return `/s/${storeSlug}/order/${orderId}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}
