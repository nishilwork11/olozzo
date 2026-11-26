import "server-only";

// CJ prices are quoted in USD; Olozzo stores money as EUR cents.
// We convert at import and at freight-quote time using a configurable rate.
// Set CJ_USD_TO_EUR in env (e.g. "0.92"). A buffer covers FX drift + Stripe fees.

const DEFAULT_RATE = 0.92; // USD → EUR fallback if env is unset
const DEFAULT_BUFFER = 0.03; // 3% added on top of the raw conversion

function rate(): number {
  const raw = Number(process.env.CJ_USD_TO_EUR);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RATE;
}

function buffer(): number {
  const raw = Number(process.env.CJ_FX_BUFFER);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_BUFFER;
}

/** Convert a USD amount (as a number of dollars, e.g. 8.5) to EUR cents, with buffer. */
export function usdToEurCents(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * rate() * (1 + buffer()) * 100);
}
