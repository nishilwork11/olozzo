# CJdropshipping × Olozzo — Integration Planning Document

**Status:** Research & planning only. No code written, no packages installed, no schema migrated.
**Date:** 2026-11-25
**Audience:** Olozzo developer + project manager, for review/approval before development.

> **Confidence legend used throughout:** ✅ *Confirmed* from official CJ docs / the Olozzo codebase · ⚠️ *Needs confirmation* from CJ support or your CJ account tier · ❓ *Assumption* to validate.

---

## 1. Project Overview

Olozzo will add CJdropshipping as a **product supplier and fulfilment partner**. Admins browse/search CJ's catalogue in the Olozzo admin panel, import selected products (with a configurable markup), and publish them to the shop. Customers buy and pay through the **existing, unchanged Stripe checkout**. After payment, Olozzo forwards the order to CJ via API, CJ ships it, and tracking flows back into the customer's order page.

**Key architectural insight:** Olozzo's data model already describes exactly this flow. It has `Supplier`, `Product` (supplier catalogue), `StoreProduct` (imported into a store), `SupplierOrder` (the slice of an order one supplier fulfils, with `carrier`/`trackingNumber`/`trackingUrl`/`shippedAt`), and `markOrderPaid()` already creates **one `SupplierOrder` per supplier** on payment ([src/lib/orders.ts:54](../src/lib/orders.ts#L54)).

➡️ **CJdropshipping is modelled as one special "virtual supplier."** CJ products become `Product` rows linked to that supplier; the `SupplierOrder` belonging to the CJ supplier is the single hook point where we call CJ's order API. This means **we are adding an adapter, not rebuilding the store.**

---

## 2. Existing Architecture Analysis (Phase 1)

| # | Area | What exists today | Reuse / Add |
|---|------|-------------------|-------------|
| 1 | Frontend | Next.js 15 (App Router), React 19, Tailwind, server components/actions | **Reuse.** Add admin screens only. |
| 2 | Backend | Next.js server actions + route handlers; `src/lib/*` service layer; `server-only` guards | **Reuse.** Add `src/lib/cj/` adapter. |
| 3 | Database | Prisma 6 on **PostgreSQL** (Vercel-ready) | **Add tables** (§5), keep existing. |
| 4 | Product mgmt | `Product`, `ProductVariant`, `Category` (2-level tree), supplier catalogue + `StoreProduct` import | **Reuse models**; extend with CJ mapping fields. |
| 5 | Admin panel | `src/app/admin/*` (orders, products, payments, suppliers, users, roles, audit, emails) | **Add** `src/app/admin/cj/*`. |
| 6 | Variants/pricing/inventory | `ProductVariant.stock`/`costPrice`; `Store.markupPercent`/`priceEnding99`; [src/lib/pricing.ts](../src/lib/pricing.ts) | **Reuse pricing math directly.** |
| 7 | Cart & checkout | `src/app/s/[slug]/cart`+`checkout`, `/api/checkout`, [src/lib/checkout.ts](../src/lib/checkout.ts) | **Reuse unchanged.** |
| 8 | Orders | `Order` + `OrderItem` + `SupplierOrder`; full lifecycle & refunds in [src/lib/orders.ts](../src/lib/orders.ts) | **Reuse.** CJ hooks into `SupplierOrder`. |
| 9 | Stripe | [src/lib/payments/stripe.ts](../src/lib/payments/stripe.ts), webhooks, `StripeEvent`/`PaymentLog`, reconcile cron | **Do not touch.** CJ is post-payment. |
| 10 | Auth/permissions | RBAC `ADMIN/MERCHANT/SUPPLIER/CUSTOMER` ([src/lib/rbac.ts](../src/lib/rbac.ts)), `requirePermission` | **Reuse**; add a `cj:manage` permission for admins. |
| 11 | API / background jobs | Route handlers + `/api/cron/payments` guarded by `CRON_SECRET`; email outbox retry pattern | **Reuse the cron + outbox pattern** for CJ sync & order push. |
| 12 | Hosting/deploy | Next.js (Vercel-style); env-based secrets (`process.env`), Vercel Cron | **Reuse.** CJ key goes in env/DB like Stripe. |

**Reuse (no rebuild):** storefront, cart, checkout, Stripe, order lifecycle, email outbox, pricing engine, category tree, audit log, cron auth, RBAC.
**New:** CJ API adapter, CJ catalogue browser + importer in admin, CJ↔Olozzo mapping tables, CJ order-push + tracking-sync jobs.

---

## 3. CJ API Documentation Summary (Phase 2)

Official docs: **https://developers.cjdropshipping.com/** (API v2.0 is the recommended version).

### A. Authentication ✅
1. Create a CJ account → enable API access in the CJ dashboard → generate an **API Key**. ⚠️ Confirm whether your account tier includes API access (§9).
2. `POST /api2.0/v1/authentication/getAccessToken` with JSON `{ "email": "...", "apiKey": "..." }` → returns `accessToken` + `refreshToken`.
3. Send `CJ-Access-Token: <accessToken>` header on all later requests.
4. **Token lifetime:** docs say access + refresh tokens last ~**180 days**; repeated token requests within 24h return the same cached token. ⚠️ A community report cites ~15 days — treat lifetime as *unknown*, store `expiresAt`, and refresh proactively. Use `POST /api2.0/v1/authentication/refreshAccessToken` (or re-auth) on 401.
5. ⚠️ Rate limit: CJ throttles token requests (roughly 1/300s historically) — **cache the token**, never fetch per request.

### B. Product API ✅ (endpoints per official v2 docs)
| Purpose | Endpoint |
|---|---|
| Product categories | `GET /api2.0/v1/product/getCategory` |
| Product list (search/filter/paginate) | `GET /api2.0/v1/product/listV2` *(the old `/product/list` is deprecated)* |
| Product detail | `GET /api2.0/v1/product/query` (by `pid`/`productSku`) |
| Variants | `GET /api2.0/v1/product/variant/query` |
| Stock by warehouse | `GET /api2.0/v1/product/stock/queryByVid` ⚠️ confirm exact path |

`listV2` query params include `pageNum`, `pageSize`, `productNameEn`/`keyword`, `categoryId`, etc. Detail responses carry title, description (HTML), image array, variants (with `variantSku`, `variantKey` e.g. colour/size, `variantSellPrice`, weight), warehouse/stock. ⚠️ Verify exact field names against the live docs when building the adapter — CJ renames fields between versions.

### C. Product Import
Covered by Olozzo's existing importer concept — see §4 and §6.

### D. Synchronization ⚠️❓
- **No reliable public webhooks** for catalogue price/stock changes are documented ❓ → **use scheduled polling** of `listV2`/detail for imported CJ products.
- CJ *does* support order/tracking callbacks via a configured callback URL ⚠️ (confirm scope) — for shipping/tracking we can use polling as the safe default regardless.
- Recommended cadence: stock/price sync **every 1–6 h** for active imported products; respect rate limits (batch, backoff). ⚠️ Exact per-endpoint rate limits unconfirmed — build conservative throttling + retry.

### E. Shipping (Phase 4) ✅
- `POST /api2.0/v1/logistic/freightCalculate` → shipping methods, cost, estimated days for a destination + variant list. Call this at **checkout quote time** (Olozzo already has [/api/checkout/quote](../src/app/api/checkout/quote)) to show accurate shipping/ETA.
- Products can ship from multiple warehouses (CN + overseas) affecting cost/time — `freightCalculate` returns options; store the chosen `logisticName`.

### F. Orders & Fulfilment (Phase 5) ✅
| Step | Endpoint |
|---|---|
| Create order (unpaid) | `POST /api2.0/v1/shopping/order/createOrderV2` |
| Query/confirm order | `GET /api2.0/v1/shopping/order/getOrderDetail` |
| Pay for order (wallet) | ⚠️ CJ orders are created **UNPAID**; funding is from your **CJ wallet balance**. Confirm whether payment is API-triggerable or dashboard-only. |
| Tracking | `GET /api2.0/v1/logistic/trackInfo` *(old `getTrackInfo` deprecated)* |
| Cancel | ⚠️ confirm endpoint/eligibility window |

> **Critical, do not assume:** CJ does **not** auto-charge your card. Each CJ order is created unpaid and is paid from your **prepaid CJ wallet**. ⚠️ Whether the "pay order" step can be done via API or must be done in the CJ dashboard is the single most important thing to confirm with CJ support, because it decides whether fulfilment is fully automated or needs a manual click.

**Sources:**
[API v2.0 overview](https://developers.cjdropshipping.com/en/api/api2/) ·
[Authentication](https://developers.cjdropshipping.cn/en/api/api2/api/auth.html) ·
[Product API](https://developers.cjdropshipping.cn/en/api/api2/api/product.html) ·
[Product sync guide](https://developers.cjdropshipping.cn/en/api/start/Products-Synchronization-Processing.html)

---

## 4. Complete Integration Workflow

**Products in (CJ → Olozzo):**
1. Admin connects CJ (saves API key) → token cached.
2. Admin browses/searches CJ catalogue in admin panel (`listV2`).
3. Admin clicks *Import* on a product → Olozzo fetches detail+variants, creates a `Product` (+`ProductVariant`s) under the **CJ virtual supplier**, and a `CjProduct` mapping row (CJ `pid`/`sku` ↔ Olozzo `productId`).
4. Retail price computed via existing `retailFromCost(cost, markupPercent, ending99)`; admin can override.
5. Admin publishes → `StoreProduct` into the house store (slug `olozzo`) and/or merchant stores. Live in the shop immediately.

**Orders back (Olozzo → CJ):**
1. Customer orders & pays via **Stripe (unchanged)**.
2. `markOrderPaid()` creates `SupplierOrder`s — the one for the CJ supplier is the trigger.
3. A background job (reusing the cron/outbox pattern) calls `createOrderV2` with address + CJ variant IDs + chosen `logisticName`. Store the returned CJ order id on the `SupplierOrder` (new column). **Idempotency key** prevents duplicate submission.
4. ⚠️ Pay the CJ order from wallet (API or dashboard — confirm).
5. Tracking-sync job polls `trackInfo`; writes `carrier`/`trackingNumber`/`trackingUrl`/`shippedAt` onto the `SupplierOrder` → existing email outbox sends the "parcel shipped" email → customer sees tracking on their order page.
6. Refund/cancel: existing refund flow cancels unshipped `SupplierOrder`s; add CJ cancel call when the order isn't yet dispatched.

---

## 5. Database Changes (suggested — not implemented)

Additive only; nothing existing is altered beyond a few nullable columns.

```prisma
// Stored CJ credentials/connection (single row, or per future multi-account)
model CjAccount {
  id            String   @id @default(cuid())
  apiKeyEnc     String   // encrypted at rest; or keep key in env and store only metadata
  accessToken   String?
  refreshToken  String?
  tokenExpires  DateTime?
  status        String   @default("DISCONNECTED") // CONNECTED | ERROR | DISCONNECTED
  lastError     String?
  updatedAt     DateTime @updatedAt
}

// Map one Olozzo Product to one CJ product (prevents duplicate imports)
model CjProduct {
  id              String   @id @default(cuid())
  productId       String   @unique            // -> Product.id
  cjPid           String                       // CJ product id
  cjSku           String
  lastSyncedAt    DateTime?
  syncStatus      String   @default("OK")      // OK | STOCK_OUT | REMOVED | ERROR
  raw             Json?                         // last CJ payload for debugging
  @@unique([cjPid])
  @@index([syncStatus])
}

// Map Olozzo ProductVariant <-> CJ variant (for stock + order line items)
model CjVariant {
  id         String @id @default(cuid())
  variantId  String @unique                    // -> ProductVariant.id
  cjVid      String                             // CJ variant id
  cjVariantSku String
}

// Audit of every sync / order-push attempt (mirrors PaymentLog pattern)
model CjSyncLog {
  id        String   @id @default(cuid())
  kind      String   // catalog-sync | order-push | track-sync | auth
  refId     String?  // productId / supplierOrderId / cj order id
  level     String   // INFO | WARN | ERROR
  message   String
  data      Json?
  createdAt DateTime @default(now())
  @@index([kind, createdAt])
}
```

**Columns added to existing models:**
- `SupplierOrder.cjOrderId String?` + `cjOrderStatus String?` + `cjPaymentStatus String?` — links an Olozzo fulfilment to its CJ order and avoids duplicate pushes.
- (Optional) `Supplier.kind String @default("MANUAL")` with value `CJ` to flag the virtual supplier, or just match by a reserved email/company name.

---

## 6. Admin Panel Requirements (Phase 6)

New section `src/app/admin/cj/` (guarded by new `cj:manage` permission):

1. **Connection** — enter/save API key, *Test connection*, show token status & last error.
2. **Browse** — search + category filter over `listV2`, paginated grid, product preview.
3. **Product detail** — images, variants, cost, warehouses, stock; *Import* button with margin preview (reuses `retailFromCost`) and manual price override.
4. **Imported products** — list of `CjProduct`s with sync status, last sync, link to the Olozzo product editor, manual *Sync now*.
5. **Sync history** — view `CjSyncLog` (filter by kind/level), like the existing Payment Log screen.
6. **CJ orders** — `SupplierOrder`s for the CJ supplier: CJ order id, CJ payment status, shipping/tracking, errors, manual *Retry push* / *Refresh tracking*.
7. **Status banner** — connection health + rate-limit/error surface.

Workflow mirrors the existing admin product/order pages, so it will feel native.

---

## 7. Technical Architecture (Phase 7)

- **Adapter layer** `src/lib/cj/` (server-only): `client.ts` (auth + token cache + rate-limit/backoff + typed fetch), `products.ts`, `logistics.ts`, `orders.ts`, `sync.ts`, `log.ts`. Mirrors the shape of `src/lib/payments/`.
- **Credentials:** API key in **env** (`CJ_API_KEY`, `CJ_EMAIL`) like Stripe/Mollie, or encrypted in `CjAccount`. **Never** sent to the client — all CJ calls are server-side.
- **Token mgmt:** single cached token (module-level + DB fallback), proactive refresh, 401 → refresh-and-retry once.
- **Background jobs:** add `/api/cron/cj` (same `CRON_SECRET` guard) running: (a) catalogue stock/price sync, (b) order-push for pending CJ `SupplierOrder`s, (c) tracking sync. Reuse the outbox "claim → attempt → record → retry with backoff" pattern.
- **Error handling/retry:** every call logged to `CjSyncLog`; failed order pushes retried with capped backoff; idempotency via `SupplierOrder.cjOrderId` presence check.
- **Webhooks:** ⚠️ none assumed for catalogue; polling is the baseline. If CJ order callbacks are confirmed, add `/api/webhooks/cj` later.
- **Rate limits:** central throttle in `client.ts`; batch catalogue syncs; conservative defaults until CJ confirms limits.

---

## 8. Security & Reliability (Phase 8)

- API key **server-only** (env or encrypted DB); never in frontend bundles or responses. ✅ matches current Stripe handling.
- Validate every CJ response with **zod** (already a dependency) before trusting it.
- **No duplicate imports:** `CjProduct.cjPid @unique`.
- **No duplicate orders:** check/stamp `SupplierOrder.cjOrderId`; idempotency key on push.
- **Stock changes during checkout:** existing `stockReserved`/stock-hold logic stays authoritative; CJ stock sync only updates the catalogue, never overrides an in-flight paid order. If CJ reports out-of-stock after payment, flag the `SupplierOrder` + alert admin (don't silently fail).
- **Payment failures:** untouched — CJ is only called **after** `paymentStatus = PAID`.
- **Sync/push failures:** logged + retried + surfaced in admin; never block the storefront.
- **Stripe stays isolated:** CJ code never imports/alters `src/lib/payments/*`; it runs strictly post-payment on `SupplierOrder`.

---

## 9. Costs & Requirements (Phase 9) ⚠️

- **CJ account:** free to register. ✅
- **API access:** generally free with a CJ account ⚠️ (confirm current policy/tier for API key generation).
- **Product cost + shipping:** paid per order from a **prepaid CJ wallet** — this is the real cost driver. ✅ wallet model; ⚠️ confirm top-up/API-pay mechanics.
- **Subscription/service fees:** CJ offers optional paid plans (e.g. VIP) ⚠️ — not required for basic API use, confirm.
- **Geographic restrictions:** depends on product/warehouse/destination — resolved per order via `freightCalculate`. ⚠️
- **Test vs production:** ❓ CJ has **no clearly documented sandbox**. Plan to test against the **live API with low-value real orders** you can cancel, or CJ's sample/test products. ⚠️ Ask CJ support whether a sandbox exists.

**Cannot confirm without CJ support/account:** exact token lifetime, per-endpoint rate limits, API-vs-dashboard order payment, sandbox availability, order-callback scope, current API-access eligibility.

---

## 3b. Pricing & Profit Formula (Phase 3)

Olozzo already implements this:

```
Customer price (gross, incl. VAT) = retailFromCost(cjCost, markupPercent, priceEnding99)
  where retail = round(cjCost × (1 + markupPercent/100)), optionally rounded to x.99
```

- CJ product cost + CJ shipping are known per order via `freightCalculate`.
- Default margin = `Store.markupPercent` (currently 150%); admin can override per product (price field on import).
- **Currency:** CJ prices are typically USD; Olozzo money is **EUR cents**. ➡️ **Add a USD→EUR conversion step** at import and at freight calc (configurable rate or FX API) — the one genuinely new pricing concern. ⚠️
- Add a **buffer** to absorb FX + Stripe fees (~1.5–3%) into the markup.
- Margin check available via `marginRate()` in [src/lib/pricing.ts](../src/lib/pricing.ts).

---

## 10. Development Roadmap

| Phase | Build | Files/modules | DB | Depends on | Testing | Outcome |
|---|---|---|---|---|---|---|
| **1. Account & API setup** | CJ account, API key, env vars | `.env`, `.env.example` | — | CJ account | Key present | Credentials ready |
| **2. Auth & connection** | `src/lib/cj/client.ts` (token cache, refresh, throttle); admin *Test connection* | `src/lib/cj/`, `admin/cj/connection` | `CjAccount` | P1 | Unit test token cache; live auth call | Admin can connect |
| **3. Browse & search** | `products.ts` (categories, `listV2`, detail); admin browse UI | `src/lib/cj/products.ts`, `admin/cj/browse` | — | P2 | Mock + live list/search | Admin sees CJ catalogue |
| **4. Import** | Import action → `Product`/`ProductVariant`/`CjProduct`/`CjVariant`; price via `retailFromCost`+FX; publish `StoreProduct` | `admin/cj/import` action, `src/lib/cj/products.ts`, `pricing.ts` | `CjProduct`,`CjVariant` | P3 | Import a product, verify in shop; dup-import blocked | Products live in shop |
| **5. Price/stock sync** | `sync.ts` + `/api/cron/cj` (catalogue) | `src/lib/cj/sync.ts`, `api/cron/cj` | `CjSyncLog` | P4 | Cron run updates stock/price; backoff on error | Catalogue stays current |
| **6. Shipping** | `logistics.ts` `freightCalculate` wired into checkout quote | `src/lib/cj/logistics.ts`, `api/checkout/quote` | — | P4 | Quote shows CJ cost/ETA per destination | Accurate shipping shown |
| **7. Order & fulfilment** | `orders.ts` `createOrderV2` on CJ `SupplierOrder`; wallet pay (API/manual) | `src/lib/cj/orders.ts`, cron order-push | `SupplierOrder.cjOrderId`+ | P5,P6 | Low-value live order → CJ order created; idempotent | Orders auto-forward to CJ |
| **8. Tracking sync** | `trackInfo` poll → `SupplierOrder` tracking → email outbox | `src/lib/cj/orders.ts`, cron track-sync | — | P7 | Tracking appears on order page + email | Customer tracks parcel |
| **9. Test & deploy** | End-to-end, rate-limit/retry hardening, admin logs, Vercel Cron entry | `vercel.json`, all above | — | all | Full buy→ship→track dry run; refund/cancel path | Production-ready |

---

## 8b. Testing Strategy

- **Unit:** adapter functions with mocked CJ responses (follow existing `*.test.ts` + zod validation); token refresh logic; FX + pricing.
- **Integration (live, controlled):** CJ has ❓no confirmed sandbox → use real API with sample/low-cost products and a funded-but-small CJ wallet; place a real order you cancel quickly. Confirm with CJ support first.
- **E2E:** full storefront purchase (Stripe test mode) → verify CJ `SupplierOrder` push, tracking sync, customer emails, refund/cancel.
- Keep **Stripe flows regression-tested** to prove CJ changes didn't touch payments.

---

## 9b. Risks & Limitations

1. **Order payment may be dashboard-only** → fulfilment not 100% automated until confirmed. *(highest-impact unknown)*
2. **No documented sandbox** → testing touches live orders/wallet.
3. **Rate limits & field renames** between CJ API versions → build defensive throttling + zod validation.
4. **Token lifetime ambiguity** (180d vs ~15d) → store `expiresAt`, refresh on 401.
5. **FX (USD→EUR)** → new conversion + margin buffer needed.
6. **Catalogue drift** (CJ removes/renames products) → handle `REMOVED/STOCK_OUT` sync states gracefully.
7. **Post-payment stock-out** → needs admin alerting + refund path (reuse existing refund).
8. **No catalogue webhooks** → polling only; pick cadence vs rate limits.

---

## 10b. Final Recommendations

1. **Model CJ as one "virtual supplier."** This reuses `Supplier`/`Product`/`StoreProduct`/`SupplierOrder`/order lifecycle and keeps Stripe, checkout and the storefront **untouched**.
2. **Build a thin `src/lib/cj/` adapter** shaped like `src/lib/payments/` — token cache, zod-validated calls, central throttle, `CjSyncLog`.
3. **Keep CJ strictly post-payment**, triggered off the CJ `SupplierOrder` created by `markOrderPaid()`.
4. **Reuse the cron + outbox pattern** (`/api/cron/cj`, `CRON_SECRET`) for sync, order-push and tracking — proven retry/backoff infrastructure.
5. **Confirm five things with CJ support before Phase 7:** order-payment-via-API, sandbox, rate limits, token lifetime, API-access eligibility.
6. **Do Phases 1–6 first** (connect → browse → import → sync → shipping): fully useful and low-risk even before order automation. Automate fulfilment (7–8) once CJ's wallet/payment mechanics are confirmed.

*No code has been written. Awaiting approval of this approach before development begins.*
