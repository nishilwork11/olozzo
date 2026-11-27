import "server-only";
import { db } from "@/lib/db";
import { logBigBuy } from "./log";

// BigBuy REST API client: static Bearer-key auth, a light request throttle and a
// production/sandbox switch.
// Docs: official user guide + https://api.bigbuy.eu/rest/doc
//
// Auth is simpler than CJ: a single API key in env (BIGBUY_API_KEY), sent as
//   Authorization: Bearer <key>
// There is no token exchange or refresh. The key is never sent to the browser.
//
// Base URL: production https://api.bigbuy.eu, sandbox https://api.sandbox.bigbuy.eu.
// Set BIGBUY_SANDBOX=true to use the sandbox (all order check/create go there).

const PROD_BASE = "https://api.bigbuy.eu";
const SANDBOX_BASE = "https://api.sandbox.bigbuy.eu";
const ACCOUNT_ID = "default";

export function bigBuyConfigured(): boolean {
  return Boolean(process.env.BIGBUY_API_KEY);
}

export function bigBuySandbox(): boolean {
  return String(process.env.BIGBUY_SANDBOX ?? "").toLowerCase() === "true";
}

function baseUrl(): string {
  const override = process.env.BIGBUY_API_BASE?.trim();
  if (override) return override.replace(/\/$/, "");
  return bigBuySandbox() ? SANDBOX_BASE : PROD_BASE;
}

export class BigBuyError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "BigBuyError";
  }
}

// ── request throttle ─────────────────────────────────────────────────────────
// BigBuy does not document a rate limit, so be conservative: serialise calls with a
// minimum gap. Tune BIGBUY_MIN_GAP_MS once the real limit is confirmed.
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;
function minGapMs(): number {
  const raw = Number(process.env.BIGBUY_MIN_GAP_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 600;
}

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = minGapMs() - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastAt = Date.now();
    }
  });
  chain = run.catch(() => {});
  return run as Promise<T>;
}

function authHeader(): Record<string, string> {
  const key = process.env.BIGBUY_API_KEY;
  if (!key) throw new BigBuyError("BIGBUY_API_KEY is not configured");
  return { Authorization: `Bearer ${key}` };
}

async function rawFetch<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${baseUrl()}${path}`;
  let res: Response;
  try {
    res = await throttle(() =>
      fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeader(), ...(init.headers ?? {}) },
        cache: "no-store",
      }),
    );
  } catch (err) {
    // A network-level failure (DNS, TLS, timeout) — fetch rejects with an opaque "fetch failed".
    // Surface the host and, in sandbox mode, the most common cause so the admin isn't left guessing.
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return baseUrl();
      }
    })();
    const detail = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    const hint = bigBuySandbox()
      ? ` The sandbox host (${host}) is often unreachable/not open — try BIGBUY_SANDBOX=false with a production key.`
      : "";
    throw new BigBuyError(`Could not reach BigBuy at ${host}${detail}.${hint}`);
  }

  const text = await res.text();
  // BigBuy returns 429 when rate-limited; surface it clearly so callers can back off.
  if (res.status === 429) {
    throw new BigBuyError(`BigBuy rate limit hit (HTTP 429)${retryAfter(res)}`, 429);
  }
  if (!res.ok) {
    throw new BigBuyError(bodyMessage(text) || `BigBuy request failed (HTTP ${res.status})`, res.status);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BigBuyError(`BigBuy returned a non-JSON response (HTTP ${res.status})`, res.status);
  }
}

function retryAfter(res: Response): string {
  const h = res.headers.get("retry-after");
  return h ? `; retry after ${h}s` : "";
}

/** Pull a human message out of a BigBuy error body (shape: { message } or { errors: [{ message }] }). */
function bodyMessage(text: string): string | null {
  if (!text) return null;
  try {
    const body = JSON.parse(text) as { message?: string; errors?: { message?: string }[] };
    if (body?.message) return body.message;
    if (Array.isArray(body?.errors) && body.errors[0]?.message) return body.errors[0].message!;
  } catch {
    /* not JSON */
  }
  return text.slice(0, 300);
}

/** Authenticated GET. Query params are appended, empty values dropped; `true` becomes a
 * bare flag like `?firstLevel` (the form BigBuy's guide uses). */
export async function bbGet<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === false) continue;
    if (v === true) parts.push(encodeURIComponent(k)); // bare flag: ?firstLevel
    else parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  const suffix = parts.length ? `?${parts.join("&")}` : "";
  return rawFetch<T>(`${path}${suffix}`, { method: "GET" });
}

/** Authenticated POST with a JSON body. */
export async function bbPost<T>(path: string, payload: unknown): Promise<T> {
  return rawFetch<T>(path, { method: "POST", body: JSON.stringify(payload) });
}

// ── connection status (admin panel) ──────────────────────────────────────────

async function markStatus(status: string, lastError: string | null): Promise<void> {
  await db.bigBuyAccount.upsert({
    where: { id: ACCOUNT_ID },
    create: { id: ACCOUNT_ID, status, lastError, lastCheckAt: new Date() },
    update: { status, lastError, lastCheckAt: new Date() },
  });
}

/**
 * Test the connection for the admin panel. Returns a plain result, never throws.
 * Uses the cheapest authenticated call available — the first-level taxonomies list.
 */
export async function bigBuyTestConnection(): Promise<{ ok: boolean; message: string }> {
  if (!bigBuyConfigured()) {
    await markStatus("DISCONNECTED", "BIGBUY_API_KEY not configured");
    return { ok: false, message: "BIGBUY_API_KEY is not set in the environment." };
  }
  try {
    await bbGet<unknown>("/rest/catalog/taxonomies.json", { firstLevel: true });
    await markStatus("CONNECTED", null);
    await logBigBuy("auth", "INFO", `Connection test OK (${bigBuySandbox() ? "sandbox" : "production"})`);
    return { ok: true, message: `Connected to BigBuy (${bigBuySandbox() ? "sandbox" : "production"}).` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await markStatus("ERROR", message);
    await logBigBuy("auth", "ERROR", `Connection test failed: ${message}`);
    return { ok: false, message };
  }
}

/** Current connection status for the admin panel. */
export async function bigBuyStatus() {
  const acc = await db.bigBuyAccount.findUnique({ where: { id: ACCOUNT_ID } });
  return {
    configured: bigBuyConfigured(),
    sandbox: bigBuySandbox(),
    status: acc?.status ?? "DISCONNECTED",
    lastError: acc?.lastError ?? null,
    lastCheckAt: acc?.lastCheckAt ?? null,
  };
}
