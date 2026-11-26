import "server-only";
import { db } from "@/lib/db";
import { logCj } from "./log";

// CJdropshipping API v2.0 client: token caching, refresh and a light request throttle.
// Docs: https://developers.cjdropshipping.com/en/api/api2/
//
// The API key lives ONLY in env (CJ_API_KEY) and is never sent to the browser.
// Access/refresh tokens are cached in the CjAccount row (id "default").

const BASE = (process.env.CJ_API_BASE || "https://developers.cjdropshipping.com/api2.0/v1").replace(/\/$/, "");
const ACCOUNT_ID = "default";

export function cjConfigured(): boolean {
  return Boolean(process.env.CJ_API_KEY && process.env.CJ_EMAIL);
}

export class CjError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "CjError";
  }
}

// ── request throttle ─────────────────────────────────────────────────────────
// CJ throttles aggressively; serialise calls with a minimum gap between them.
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const MIN_GAP_MS = 1100;

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastAt);
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

type CjEnvelope<T> = { code: number; result: boolean; message: string; data: T };

async function rawFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await throttle(() =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    }),
  );
  let body: CjEnvelope<T>;
  try {
    body = (await res.json()) as CjEnvelope<T>;
  } catch {
    throw new CjError(`CJ returned a non-JSON response (HTTP ${res.status})`, res.status);
  }
  // CJ uses code 200 for success inside a 200 HTTP response.
  if (!res.ok || body.code !== 200 || body.result === false) {
    throw new CjError(body?.message || `CJ request failed (HTTP ${res.status})`, body?.code ?? res.status);
  }
  return body.data;
}

// ── authentication ───────────────────────────────────────────────────────────

type TokenData = { accessToken: string; accessTokenExpiryDate?: string; refreshToken?: string };

/** Force a fresh login with the env API key and cache the token. */
export async function cjAuthenticate(): Promise<string> {
  if (!cjConfigured()) throw new CjError("CJ_API_KEY / CJ_EMAIL are not configured");
  const data = await rawFetch<TokenData>("/authentication/getAccessToken", {
    method: "POST",
    body: JSON.stringify({ email: process.env.CJ_EMAIL, apiKey: process.env.CJ_API_KEY }),
  });
  if (!data?.accessToken) throw new CjError("CJ did not return an access token");
  const expires = data.accessTokenExpiryDate ? new Date(data.accessTokenExpiryDate) : null;
  await db.cjAccount.upsert({
    where: { id: ACCOUNT_ID },
    create: {
      id: ACCOUNT_ID,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      tokenExpires: expires,
      status: "CONNECTED",
      lastError: null,
      lastCheckAt: new Date(),
    },
    update: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      tokenExpires: expires,
      status: "CONNECTED",
      lastError: null,
      lastCheckAt: new Date(),
    },
  });
  await logCj("auth", "INFO", "Authenticated with CJ and cached access token");
  return data.accessToken;
}

/** A valid access token, authenticating or refreshing if the cached one is missing/expired. */
async function getToken(): Promise<string> {
  const acc = await db.cjAccount.findUnique({ where: { id: ACCOUNT_ID } });
  const fresh = acc?.accessToken && acc.tokenExpires && acc.tokenExpires.getTime() - Date.now() > 60_000;
  if (fresh && acc?.accessToken) return acc.accessToken;
  return cjAuthenticate();
}

/** Authenticated GET. Retries once on an auth error after re-authenticating. */
export async function cjGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const suffix = qs.toString() ? `?${qs}` : "";
  return withAuthRetry((token) => rawFetch<T>(`${path}${suffix}`, { method: "GET", headers: { "CJ-Access-Token": token } }));
}

/** Authenticated POST. Retries once on an auth error after re-authenticating. */
export async function cjPost<T>(path: string, payload: unknown): Promise<T> {
  return withAuthRetry((token) =>
    rawFetch<T>(path, { method: "POST", headers: { "CJ-Access-Token": token }, body: JSON.stringify(payload) }),
  );
}

async function withAuthRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getToken();
  try {
    return await fn(token);
  } catch (err) {
    // Token invalid/expired → re-authenticate once and retry.
    if (err instanceof CjError && (err.code === 401 || err.code === 1600000 || /token/i.test(err.message))) {
      const retryToken = await cjAuthenticate();
      return fn(retryToken);
    }
    throw err;
  }
}

/** Test the connection for the admin panel. Returns a plain result, never throws. */
export async function cjTestConnection(): Promise<{ ok: boolean; message: string }> {
  if (!cjConfigured()) {
    await markStatus("DISCONNECTED", "CJ_API_KEY / CJ_EMAIL not configured");
    return { ok: false, message: "CJ_API_KEY and CJ_EMAIL are not set in the environment." };
  }
  try {
    await cjAuthenticate();
    return { ok: true, message: "Connected to CJdropshipping." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await markStatus("ERROR", message);
    await logCj("auth", "ERROR", `Connection test failed: ${message}`);
    return { ok: false, message };
  }
}

async function markStatus(status: string, lastError: string | null): Promise<void> {
  await db.cjAccount.upsert({
    where: { id: ACCOUNT_ID },
    create: { id: ACCOUNT_ID, status, lastError, lastCheckAt: new Date() },
    update: { status, lastError, lastCheckAt: new Date() },
  });
}

/** Current connection status for the admin panel. */
export async function cjStatus() {
  const acc = await db.cjAccount.findUnique({ where: { id: ACCOUNT_ID } });
  return {
    configured: cjConfigured(),
    status: acc?.status ?? "DISCONNECTED",
    lastError: acc?.lastError ?? null,
    lastCheckAt: acc?.lastCheckAt ?? null,
    tokenExpires: acc?.tokenExpires ?? null,
  };
}
