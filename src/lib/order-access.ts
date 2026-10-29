import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Guest order links. A random token goes into the customer's order-page link (and the payment return URL);
// only its SHA-256 hash is stored, so a database leak does not leak working links.

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

type Viewer = { id: string; role: string } | null;

/**
 * Who may see an order's details (name, address, items): the customer who placed it while signed in,
 * anyone holding its link token, the store's owner and platform admins.
 */
export function canViewOrder(
  order: { customerId: string | null; accessTokenHash: string | null; store: { ownerId: string } },
  viewer: Viewer,
  token: string | null | undefined,
): boolean {
  if (viewer?.role === "ADMIN") return true;
  if (viewer && order.customerId === viewer.id) return true;
  if (viewer && order.store.ownerId === viewer.id) return true;
  return orderTokenMatches(order.accessTokenHash, token);
}

/** The customer-facing order page, with the token when there is one. */
export function orderPagePath(storeSlug: string, orderId: string, token?: string | null): string {
  return `/s/${storeSlug}/order/${orderId}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}
