# Olozzo × CJdropshipping — Setup Guide

A step-by-step setup to connect CJdropshipping, import products, and turn on automatic fulfilment. Follow the steps in order. Est. time: ~30 minutes (plus CJ account verification).

> Code reference: adapter in [src/lib/cj/](../src/lib/cj/), admin UI at `/admin/cj`, background jobs at [/api/cron/cj](../src/app/api/cron/cj/route.ts). Architecture: [CJdropshipping_Integration_Plan.md](./CJdropshipping_Integration_Plan.md).

---

## Step 1 — Create & verify a CJdropshipping account

1. Sign up at **https://cjdropshipping.com** (free).
2. Complete email verification and basic profile. Some API features require a verified account.
3. (Optional now, required before fulfilment) **top up your CJ wallet** — CJ orders are paid from a prepaid balance, not your card. See Step 8.

## Step 2 — Generate your API key

1. In the CJ dashboard open **Account → API** (sometimes under "My CJ → Authorization" / "Developer").
2. Click **Generate / Get API Key** and copy the key.
3. Note the **email** you log in to CJ with — you need both the email and the API key.

> The key is a secret. It goes on the server only (Step 3) and is never exposed to the browser.

## Step 3 — Configure environment variables

Edit your **`.env`** (local) and your production environment (Vercel → Project → Settings → Environment Variables). See [.env.example](../.env.example) for the block.

```env
CJ_EMAIL="you@example.com"        # the email you log in to CJ with
CJ_API_KEY="your-cj-api-key"      # from Step 2 — server-only secret

# Optional tuning (sensible defaults already apply):
# CJ_API_BASE="https://developers.cjdropshipping.com/api2.0/v1"
CJ_USD_TO_EUR="0.92"              # CJ prices are USD; Olozzo stores EUR
CJ_FX_BUFFER="0.03"              # 3% buffer for FX drift + Stripe fees
```

Make sure **`CRON_SECRET`** is already set (shared with the payments cron) — the CJ background jobs reuse it.

Restart `next dev` (or redeploy) after changing env vars.

## Step 4 — Apply the database migration

The integration adds tables (`CjAccount`, `CjProduct`, `CjVariant`, `CjSyncLog`) and nullable columns on `SupplierOrder`. All additive — nothing existing changes.

```bash
npx prisma db push --accept-data-loss
```

> `--accept-data-loss` is required only because a unique index is added on the new, always-empty `cjOrderId` column. No data is dropped. Run `npx prisma generate` afterward if your client is stale (the build does this automatically).

Confirm the shop has its **house store** seeded (slug `olozzo`) — imports publish there. If not: `npm run db:seed`.

## Step 5 — Test the connection

1. Sign in as an **admin** and open **Admin → CJdropshipping** (`/admin/cj`).
2. Check that **Credentials** shows "CJ_API_KEY set".
3. Click **Test connection**.
   - ✅ "Connected to CJdropshipping." → status turns **CONNECTED**.
   - ❌ Read the error shown; the full history is on the same page under *Recent CJ activity*. Common causes: wrong email/key, API not enabled on the CJ account, or rate limiting (wait a minute and retry).

## Step 6 — Browse & import products

1. From `/admin/cj` click **Browse CJ products** (`/admin/cj/browse`).
2. Search by keyword, review results (image, name, CJ cost in USD).
3. Click **Import** on a product. Olozzo will:
   - fetch the product + variants from CJ,
   - convert the USD cost to EUR (with your buffer) and apply the house store's markup to set the retail price,
   - create the catalogue product, the CJ id mapping, and **publish it to the shop immediately**.
4. Already-imported products show a disabled **Imported** button (no duplicates).
5. Edit retail price, title, images, and visibility through the normal **Admin → Products** / store product tools — merchants own the retail price; sync never overwrites it.

## Step 7 — Turn on background jobs (sync + fulfilment)

The CJ jobs run from `GET /api/cron/cj`, protected by `CRON_SECRET`. They (a) forward paid orders to CJ, (b) pull tracking, (c) refresh catalogue cost / delistings.

**On Vercel** — add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/cj", "schedule": "*/20 * * * *" }] }
```

**Anywhere else** — crontab / GitHub Actions / uptime monitor:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/cj
```

Run it every 15–30 minutes. (Mind your Vercel plan's cron frequency limit.)

## Step 8 — Fund the CJ wallet & confirm the payment step ⚠️

This is the one step that is **not fully automated yet**:

- When a customer pays on Olozzo (Stripe, unchanged), the CJ cron creates a **CJ order in UNPAID state** and marks it `UNPAID_PENDING_WALLET`.
- CJ orders are paid from your **prepaid CJ wallet balance** — CJ does **not** charge your card automatically.
- **Action:** keep the CJ wallet topped up, and **confirm with CJ support whether the wallet payment can be triggered via API**. Until confirmed, pay each created order from the **CJ dashboard** (or we wire the pay call once CJ confirms it).

Once an order is paid and CJ ships it, the tracking cron (Step 7) marks the Olozzo fulfilment **SHIPPED** and emails the customer the tracking link automatically.

## Step 9 — Test vs live

- CJ has **no confirmed sandbox**. To test end-to-end: import a **low-cost product**, place a real order using **Stripe test mode**, let the cron push it, then pay/cancel the CJ order from the dashboard.
- Verify: order appears in CJ, `cjOrderId` fills on the fulfilment, tracking flows back, customer gets the shipping email.
- Watch **Admin → CJdropshipping → Recent CJ activity** and `CjSyncLog` for any errors.

---

## Quick checklist

- [ ] CJ account created & verified
- [ ] API key generated
- [ ] `CJ_EMAIL`, `CJ_API_KEY` set in `.env` and production
- [ ] `CRON_SECRET` set
- [ ] `npx prisma db push --accept-data-loss` run
- [ ] House store (`olozzo`) seeded
- [ ] **Test connection** → CONNECTED
- [ ] First product imported & visible in shop
- [ ] `/api/cron/cj` scheduled
- [ ] CJ wallet funded; wallet-payment method confirmed with CJ ⚠️
- [ ] End-to-end test order completed

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `/admin/cj` errors on load | Migration not applied — run Step 4. |
| "Not configured" badge | `CJ_EMAIL`/`CJ_API_KEY` missing or app not restarted after setting them. |
| Test connection fails | Wrong key/email, API not enabled on CJ account, or rate limited — retry after ~60s. |
| Import says "already imported" | The CJ product id is already mapped (`CjProduct`). |
| Import: "House store not found" | Seed the shop (`npm run db:seed`). |
| Fields look wrong after import | CJ field names vary by API version; the raw payload is saved to `CjProduct.raw` — share it so the mapping can be adjusted. |
| Orders not reaching CJ | Cron not scheduled, `CRON_SECRET` mismatch, or no CJ variant mapping on the items — check `CjSyncLog`. |
