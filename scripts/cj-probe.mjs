// Standalone CJdropshipping API probe — no DB, no dev server.
// It authenticates, runs one search, and fetches one product's detail, printing the
// RAW JSON so you can confirm credentials and the real field names CJ returns.
//
// Run (Node 20.6+, reads CJ_EMAIL / CJ_API_KEY from .env):
//   node --env-file=.env scripts/cj-probe.mjs
//   node --env-file=.env scripts/cj-probe.mjs "phone case"   # custom search term

const BASE = (process.env.CJ_API_BASE || "https://developers.cjdropshipping.com/api2.0/v1").replace(/\/$/, "");
const EMAIL = process.env.CJ_EMAIL;
const API_KEY = process.env.CJ_API_KEY;
const keyword = process.argv[2] || "phone case";

if (!EMAIL || !API_KEY) {
  console.error("✖ CJ_EMAIL / CJ_API_KEY are not set. Put them in .env and run with:  node --env-file=.env scripts/cj-probe.mjs");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Find the product array anywhere in a CJ response (CJ nests it under varying keys).
function pickItems(node, depth = 0) {
  if (depth > 6 || node == null) return [];
  if (Array.isArray(node)) {
    if (node.some((el) => el && typeof el === "object" && (el.id || el.pid) && (el.nameEn || el.productNameEn || el.productName))) return node;
    for (const el of node) { const f = pickItems(el, depth + 1); if (f.length) return f; }
    return [];
  }
  if (typeof node === "object") {
    for (const v of Object.values(node)) { const f = pickItems(v, depth + 1); if (f.length) return f; }
  }
  return [];
}

async function cj(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "CJ-Access-Token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ parseError: true }));
  if (json.code !== 200 || json.result === false) {
    throw new Error(`HTTP ${res.status} · code ${json.code} · ${json.message || "request failed"}`);
  }
  return json.data;
}

const preview = (obj) => console.log(JSON.stringify(obj, null, 2).slice(0, 2000));

(async () => {
  console.log(`=== CJ probe v2 ===`);
  console.log(`→ Base: ${BASE}\n→ Authenticating as ${EMAIL} …`);
  const auth = await cj("/authentication/getAccessToken", { method: "POST", body: { email: EMAIL, apiKey: API_KEY } });
  const token = auth.accessToken;
  console.log(`✔ Authenticated. Token expires: ${auth.accessTokenExpiryDate || "(unknown)"}\n`);

  await sleep(1200); // respect CJ throttle
  console.log(`→ Searching listV2 for "${keyword}" …`);
  const list = await cj(`/product/listV2?pageNum=1&pageSize=5&productNameEn=${encodeURIComponent(keyword)}`, { token });
  console.log(`  data top-level keys: ${Object.keys(list || {}).join(", ")}`);
  const items = pickItems(list);
  console.log(`✔ found ${items.length} product(s) by shape. First item raw:`);
  preview(items[0] || list);

  const pid = items[0]?.pid || items[0]?.id;
  console.log(`\n(items array length = ${items.length}; first pid/id = ${pid ?? "NONE"})`);
  if (pid) {
    await sleep(1200);
    console.log(`\n→ Fetching DETAIL for product ${pid}  (/product/query) …`);
    try {
      const detail = await cj(`/product/query?pid=${encodeURIComponent(pid)}`, { token });
      console.log("✔ Detail raw (truncated):");
      preview(detail);
    } catch (e) {
      console.log(`✖ /product/query failed: ${e.message}`);
    }

    await sleep(1200);
    console.log(`\n→ Fetching VARIANTS for product ${pid}  (/product/variant/query) …`);
    try {
      const v = await cj(`/product/variant/query?pid=${encodeURIComponent(pid)}`, { token });
      console.log("✔ Variants raw (truncated) — note vid / variantSku / variantSellPrice names:");
      preview(v);
    } catch (e) {
      console.log(`✖ /product/variant/query failed: ${e.message}`);
    }
  }
  console.log("\n✅ Probe finished.");
})().catch((err) => {
  console.error(`\n✖ Probe failed: ${err.message}`);
  process.exit(1);
});
