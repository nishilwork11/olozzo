# Olozzo × BigBuy — Setup Guide

A step-by-step setup to connect BigBuy, cache its catalogue, import products, and turn on automatic fulfilment. Follow the steps in order. Est. time: ~30 minutes (plus BigBuy account + pack approval).

> Code reference: adapter in [src/lib/bigbuy/](../src/lib/bigbuy/), admin UI at `/admin/bigbuy`, background jobs at [/api/cron/bigbuy](../src/app/api/cron/bigbuy/route.ts). Modelled on the CJ integration ([src/lib/cj/](../src/lib/cj/)); BigBuy is a second "virtual supplier".

---

## Step 1 — Create a BigBuy account **with an API-capable pack** ⚠️

1. Sign up at **https://www.bigbuy.eu** as a **distributor** (business account).
2. **Activate a pack that includes API access.** This is the step people miss:
   - The **Ecommerce** or **Marketplace** pack **includes** API + CSV/XML sync.
   - The **B2B / Wholesaler** pack does **not** include API — a key issued under it returns `401 Invalid Token`.
   - Activate it in **My Account → Wholesaler Pack → Activate pack**, or ask BigBuy sales: *"Which pack do I need so my Production API key stops returning 401 Invalid Token?"*
3. Note your account id (shown in the control panel). You'll reference it with BigBuy support if the key is rejected.

> Opening the account is free, but API access requires a **paid pack** (monthly fee + one-time registration). Product + shipping costs are paid later from a prepaid **BigBuy balance** (Step 8).

## Step 2 — Get your API key

1. In the BigBuy **control panel** open **My Account → Synchronise with BigBuy**.
2. Under **API KEY**, click the **eye** icon to reveal **API Key Production**, then the **copy** icon. *(Don't retype it; don't click the regenerate/refresh icon unless you intend to invalidate the current key.)*
3. A separate **sandbox** key may be listed or requested via BigBuy's contact form. Note: the BigBuy sandbox is **order-flow only — it does not serve the catalogue**, and its host is often unreachable, so most testing uses the production key (read-only calls are safe).

> The key is a secret. It goes on the server only (Step 3), sent as `Authorization: Bearer <key>`, and is never exposed to the browser.

## Step 3 — Configure environment variables

Edit your **`.env`** (local) and your production environment (Vercel → Project → Settings → Environment Variables). See [.env.example](../.env.example) for the full block.

```env
BIGBUY_API_KEY="your-bigbuy-api-key"   # from Step 2 — server-only secret
BIGBUY_SANDBOX="false"                 # false = production host (api.bigbuy.eu). Sandbox has no catalogue.

# Optional tuning (sensible defaults already apply):
# BIGBUY_API_BASE=""                   # override host; otherwise prod/sandbox chosen by BIGBUY_SANDBOX
BIGBUY_LANG="en"                       # catalogue text / import language (ISO code)
BIGBUY_MIN_GAP_MS="600"                # min gap between BigBuy API calls (throttle)
BIGBUY_PAYMENT_METHOD="moneybox"       # how BigBuy orders are funded: moneybox | bankwire | paypal
BIGBUY_CARRIERS=""                     # optional "gls,ups,dhl"; empty = BigBuy picks the cheapest
BIGBUY_TRACKING_ENABLED="false"        # keep false until tracking endpoints are confirmed (see Step 8)
```

Make sure **`CRON_SECRET`** is already set (shared with the payments and CJ crons) — the BigBuy background jobs reuse it.

Restart `next dev` (or redeploy) after changing env vars — Next.js reads them at startup.

> BigBuy prices are already **EUR** and **net (ex-VAT)**, so there is no currency conversion (unlike CJ). Retail is the net cost × the house store's markup, VAT added at checkout.

## Step 4 — Apply the database migration

The integration adds tables (`BigBuyAccount`, `BigBuyCatalogItem`, `BigBuyProduct`, `BigBuyVariant`, `BigBuySyncLog`) and nullable columns on `SupplierOrder`. All additive — nothing existing changes.

```bash
npx prisma db push --accept-data-loss
```

> `--accept-data-loss` is required only because a unique index is added on the new, always-empty `bigBuyOrderId` column. No data is dropped. Run `npx prisma generate` afterward if your client is stale (the build does this automatically).

Confirm the shop has its **house store** seeded (slug `olozzo`) — imports publish there. If not: `npm run db:seed` then `npm run db:seed-catalog`.

## Step 5 — Test the connection

1. Sign in as an **admin** and open **Admin → BigBuy** (`/admin/bigbuy`).
2. Check that **Credentials** shows "BIGBUY_API_KEY set" and **Environment** shows the mode you chose.
3. Click **Test connection**.
   - ✅ "Connected to BigBuy (production)." → status turns **CONNECTED**.
   - ❌ `Invalid Token` → your account has **no API-capable pack** (Step 1), or the wrong key was copied. See Troubleshooting.
   - ❌ `Could not reach BigBuy at api.sandbox.bigbuy.eu …` → you're in sandbox mode; set `BIGBUY_SANDBOX="false"` and restart.

## Step 6 — Cache the catalogue, then browse & import

BigBuy has **no live product search**, so you first pull a first-level taxonomy into a local cache that Browse reads.

1. Find first-level taxonomy ids: `GET /rest/catalog/taxonomies.json?firstLevel` (with your Bearer key), or just try ids shown in the BigBuy catalogue.
2. On `/admin/bigbuy`, in **Catalogue cache**, enter a **first-level taxonomy id** and click **Pull taxonomy**. Olozzo fetches that taxonomy's products, text, images, variations and stock and caches them.
3. Click **Browse BigBuy products** (`/admin/bigbuy/browse`), search by name or SKU, review results (image, EUR cost, stock).
4. Click **Import**. Olozzo will:
   - read the cached product + variations,
   - apply the house store's markup to the net EUR cost to set the retail price,
   - create the catalogue product, the BigBuy id mapping, and **publish it to the shop immediately**.
5. Already-imported products show a disabled **Imported** button (no duplicates — dedup on BigBuy SKU).
6. Edit retail price, title, images and visibility through **Admin → Products** / store product tools — sync never overwrites retail.

## Step 7 — Turn on background jobs (sync + fulfilment)

The BigBuy jobs run from `GET /api/cron/bigbuy`, protected by `CRON_SECRET`. They (a) forward paid orders to BigBuy (check → create), (b) pull tracking (when enabled), (c) refresh cost/stock and delistings for imported products.

**On Vercel** — add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/bigbuy", "schedule": "*/20 * * * *" }] }
```

**Anywhere else** — crontab / GitHub Actions / uptime monitor:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/bigbuy
```

Run it every 15–30 minutes. (BigBuy recommends refreshing stock every 10–15 min and catalogue text every 8–24 h; the cron is conservative and only re-pulls taxonomies that contain imported products.)

## Step 8 — Fund the BigBuy balance, confirm payment & tracking ⚠️

Two steps here are **not fully automated yet**:

- **Order funding:** when a customer pays on Olozzo (Stripe, unchanged), the BigBuy cron validates the order (`check`) then creates it (`create`) and marks it `UNPAID_PENDING_BALANCE`. BigBuy orders are funded from your **prepaid BigBuy balance / Wallet** — not your card automatically. **Action:** keep the balance topped up, and confirm with BigBuy whether funding can be triggered via API; until then, confirm each created order from the BigBuy dashboard.
- **Tracking:** BigBuy's order-status and tracking endpoints are **not in the official guide**. They are isolated in `getBigBuyOrderStatus()` ([src/lib/bigbuy/orders.ts](../src/lib/bigbuy/orders.ts)) and gated behind `BIGBUY_TRACKING_ENABLED`. Confirm the exact paths at **https://api.bigbuy.eu/rest/doc** (Orders / Tracking tags), fill them in, then set `BIGBUY_TRACKING_ENABLED="true"`. Once on, the cron marks the fulfilment **SHIPPED** and emails the customer the tracking link automatically.

## Step 9 — Test vs live

- The BigBuy **sandbox** (`api.sandbox.bigbuy.eu`) handles the **order flow only** and does **not** serve the catalogue (and is often unreachable), so catalogue pull/import must be tested against **production** (those calls are read-only and safe).
- The order `check` call is **non-mutating** — safe to run even in production to validate an order without creating it.
- To test fulfilment end-to-end without spending: import a product, place an order with **Stripe test mode**, and inspect `check`/`create` results in **Admin → BigBuy → Recent BigBuy activity** and `BigBuySyncLog`. Only a real `create` against production with a funded balance places a real order.

---

## Quick checklist

- [ ] BigBuy account created, **API-capable pack active** (Ecommerce/Marketplace)
- [ ] Production API key copied from the control panel
- [ ] `BIGBUY_API_KEY` set; `BIGBUY_SANDBOX="false"` for real catalogue
- [ ] `CRON_SECRET` set
- [ ] `npx prisma db push --accept-data-loss` run
- [ ] House store (`olozzo`) seeded
- [ ] **Test connection** → CONNECTED
- [ ] A taxonomy pulled into the cache; first product imported & visible in shop
- [ ] `/api/cron/bigbuy` scheduled
- [ ] BigBuy balance funded; funding method confirmed ⚠️
- [ ] Tracking endpoints confirmed → `BIGBUY_TRACKING_ENABLED="true"` ⚠️
- [ ] End-to-end test order completed

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Test connection: **`Invalid Token`** | Account has **no API-capable pack** (activate Ecommerce/Marketplace), or the wrong key was copied. The B2B/Wholesaler pack does **not** include API. |
| **`Could not reach BigBuy at api.sandbox.bigbuy.eu`** | You're in sandbox mode; the sandbox host is unreachable/has no catalogue. Set `BIGBUY_SANDBOX="false"` and restart. |
| "Not configured" badge | `BIGBUY_API_KEY` missing or app not restarted after setting it. |
| `/admin/bigbuy` errors on load | Migration not applied — run Step 4. |
| Browse shows "No cached products" | Pull a first-level taxonomy into the cache first (Step 6). |
| Import says "already imported" | The BigBuy SKU is already mapped (`BigBuyProduct`). |
| Import: "House store not found" | Seed the shop (`npm run db:seed` + `npm run db:seed-catalog`). |
| Orders not reaching BigBuy | Cron not scheduled, `CRON_SECRET` mismatch, or no BigBuy reference mapping on the items — check `BigBuySyncLog`. |
| No tracking appears | `BIGBUY_TRACKING_ENABLED` is false or the endpoint paths aren't confirmed yet (Step 8). |

---

*Related: [Olozzo_BigBuy_Connect_API_Guide.md](./Olozzo_BigBuy_Connect_API_Guide.md) (plain-language account + connect).*
