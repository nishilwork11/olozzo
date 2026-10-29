# Olozzo.com: Stripe Live Integration Guide

| | |
|---|---|
| **Audience** | Developers and technical project leads; client-facing sections are summarised from the Client Setup Guide |
| **Status of the code described** | Branch `stripe-integration-hardening`, **uncommitted working tree** on top of commit `3f49ae8` (inspected 29 Oct 2026) |
| **Companion documents** | [Live Deployment Guide](Olozzo_Stripe_Live_Deployment_Guide.md) · [Production Runbook](Olozzo_Stripe_Production_Runbook.md) · [Launch Checklist](Olozzo_Stripe_Launch_Checklist.md) · [Client Setup Guide](Olozzo_Stripe_Client_Setup_Guide.md) · [Test/Live Mode Guide](Olozzo_Stripe_Test_Live_Mode_Guide.md) |
| **Secrets in this document** | None. All keys, secrets, domains and account details are placeholders such as `<PRODUCTION_DOMAIN>` |

Status labels used throughout:

| Label | Meaning |
|---|---|
| ✅ **Verified** | Implemented and verified (code read and exercised in sandbox QA on 29 Oct 2026) |
| 🟡 **Needs verification** | Implemented, but not yet verified in the target environment |
| ❌ **Missing** | Missing or incomplete |
| ➖ **N/A** | Not applicable to this integration |
| ❓ **Unknown** | Information not available in the repository |

---

## 1. Executive summary

Olozzo.com accepts payments through **Stripe Checkout**, a payment page hosted by Stripe. The website creates a Checkout Session for each order, sends the customer to Stripe, and confirms the payment in two independent ways: a **signed webhook** from Stripe and a **direct check when the customer returns** to the order page. Card details never touch Olozzo's servers.

The integration works end to end in a **Stripe sandbox (test mode)** on the local development server. A QA pass on 29 Oct 2026 covered all 2,255 product variants, 30 Checkout Sessions, real browser payments (card, 3D Secure, decline, cancel, SEPA success and failure, dispute), refunds, expiry, duplicate and forged webhooks, with 45 of 45 webhook deliveries succeeding.

To accept real money, four things remain:

1. **Client:** activate the client's own Stripe account (business verification) and add a payout bank account. See the [Client Setup Guide](Olozzo_Stripe_Client_Setup_Guide.md).
2. **Developer:** commit, review and merge the uncommitted integration work, then update the production database schema.
3. **Developer:** configure live credentials and a live webhook endpoint on the production host, which is not yet identified (❓).
4. **Both:** run a controlled, client-authorised real payment and refund before launch.

The application has **no Test/Live switch**. The mode is decided only by which Stripe key is configured. Using sandbox keys on the production website would turn simulated payments into "paid" orders that are routed to suppliers, so testing belongs on a **separate staging deployment**. See the [Test/Live Mode Guide](Olozzo_Stripe_Test_Live_Mode_Guide.md).

---

## 2. Existing integration architecture

### 2.1 Stack ✅

| Component | Version / detail | Source |
|---|---|---|
| Framework | Next.js 15.5.28 (App Router, Route Handlers, Server Actions), React 19.2.9, TypeScript | `package.json` |
| Database | PostgreSQL via Prisma ORM 6.19.3; schema applied with `prisma db push` (no migrations folder) | `prisma/schema.prisma`, `package.json` scripts |
| Stripe SDK | `stripe` **23.0.1**, which pins API version **`2026-09-30.endive`** | `package.json`, `src/lib/payments/stripe.ts` |
| Stripe.js / publishable key | **Not used**: hosted Checkout needs no client-side Stripe code | No `pk_`, `loadStripe` or `@stripe/stripe-js` in the repository |
| Node.js | `stripe@23` requires Node ≥ 20 (local machine: 22.15.0) | `stripe` package `engines` field |
| Other providers | Mollie (`MOLLIE_API_KEY`), and a "demo" provider for development only | `src/lib/payments/mollie.ts`, `src/lib/payments/rules.ts` |

### 2.2 Payment flow ✅

```
Customer         Olozzo.com (Next.js server)                      Stripe
────────         ───────────────────────────                      ──────
Checkout form ─► POST /api/checkout
                  · validate input (zod), re-price cart on server
                  · reuse open order for same checkoutKey
                  · create Order (UNPAID, stock held 60 min)
                  · create Checkout Session ─────────────────────► Session (amount = order total, EUR)
◄──────────────── redirect to session.url
Pays on Stripe ──────────────────────────────────────────────────► Payment processed
                  POST /api/webhooks/stripe ◄──────────────────── checkout.session.completed (signed)
                  · verify signature, skip duplicates
                  · re-fetch session from Stripe, mark order PAID
                  · create one SupplierOrder per supplier
◄──────────────── redirect to /s/<store>/order/<id>?t=<token>&session_id=<cs_…>
Order page        · confirms with Stripe again if still unpaid
```

### 2.3 Files and functions ✅

| Responsibility | File | Function(s) |
|---|---|---|
| Stripe client and Checkout Session | `src/lib/payments/stripe.ts` | `stripe()`, `stripeEnabled()`, `stripeMode()`, `createStripeCheckout()`, `getStripeSession()`, `expireStripeSession()`, `refundStripe()`, `paymentIntentIdOf()` |
| Provider orchestration | `src/lib/payments/index.ts` | `paymentOptions()`, `startPayment()`, `resumablePaymentUrl()`, `retireUnpaidOrder()`, `verifyPayment()`, `refundPayment()`, `refundOrderInFull()`, `paymentSetup()` |
| Webhook event handling | `src/lib/payments/stripe-events.ts` | `STRIPE_WEBHOOK_EVENTS`, `applyCheckoutSession()`, `handleStripeEvent()` |
| Pure rules (unit-tested) | `src/lib/payments/rules.ts` (+ `rules.test.ts`) | `PAYMENT_WINDOW_MINUTES` (60), `stripeKeyMode()`, `demoPaymentsAllowed()`, `stripePaymentUrl()`, `checkoutSummary()`, `sameCheckout()` |
| Checkout API | `src/app/api/checkout/route.ts` | `POST` |
| Live price quote API | `src/app/api/checkout/quote/route.ts` | `POST` |
| Webhook endpoint | `src/app/api/webhooks/stripe/route.ts` | `POST` |
| Server-side pricing and order creation | `src/lib/checkout.ts` | `quoteCart()`, `createOrderFromQuote()`, `reservedStock()` |
| Order state transitions | `src/lib/orders.ts` | `markOrderPaid()`, `markPaymentPending()`, `markPaymentFailed()`, `cancelUnpaidOrder()`, `markOrderRefunded()`, `flagPaymentForReview()` |
| Guest order-page access | `src/lib/order-access.ts` | `newOrderAccessToken()`, `canViewOrder()`, `orderPagePath()` |
| Return (success) page | `src/app/s/[slug]/order/[orderId]/page.tsx` | `OrderStatusPage` |
| Checkout page and form | `src/app/s/[slug]/checkout/page.tsx`, `src/components/store/CheckoutForm.tsx`, `src/components/store/CartProvider.tsx` | |
| Admin payment tools | `src/app/admin/payments/page.tsx`, `src/app/admin/orders/[id]/page.tsx`, `src/app/admin/actions.ts`, `src/components/orders/PaymentPanel.tsx` | `adminRefundOrder()`, `adminCancelUnpaidOrder()`, `adminSyncPayment()` |
| Merchant refunds | `src/app/merchant/actions.ts`, `src/app/merchant/orders/[id]/page.tsx` | uses `refundOrderInFull()` |
| Route protection (webhooks excluded) | `src/middleware.ts` | `config.matcher` excludes `api/webhooks` |

### 2.4 Data model ✅

| Table (Prisma model) | Payment-related fields |
|---|---|
| `Order` | `paymentProvider` (`stripe`/`mollie`/`demo`), `paymentStatus` (`UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`), `status` (`PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`), `paymentRef` (Checkout Session `cs_…`), `paymentIntentId` (`pi_…`, unique), `paymentExpiresAt`, `stockReserved`, `checkoutKey`, `accessTokenHash`, `paymentFailureReason`, `paidAt`, `refundedAt`, `total` (cents), `currency` |
| `OrderItem`, `SupplierOrder` | Created when payment succeeds: one `SupplierOrder` per supplier (fulfilment trigger) |
| `ProductVariant.stock` | Held while a payment is open; decremented by `markOrderPaid()` |
| `DiscountCode.usedCount` | Incremented by `markOrderPaid()` |
| `StripeEvent` | Processed webhook event IDs (`evt_…`), type, order ID and summary; used for de-duplication and the admin event log |
| `AuditLog` | `order.created`, `order.paid`, `order.payment_pending`, `order.payment_failed`, `order.refunded`, `order.payment_review`, `order.oversold`, `order.payment_synced` |

`Order` columns `checkoutKey`, `accessTokenHash`, `stockReserved`, `paymentExpiresAt`, `paymentIntentId`, `paymentFailureReason`, `refundedAt` and the `StripeEvent` table are **new in the uncommitted branch**. The production database must be updated before the new code runs there (see the [runbook](Olozzo_Stripe_Production_Runbook.md), §3.4).

### 2.5 Environment variables ✅

| Variable | Used by | Purpose | Secret? |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `src/lib/payments/stripe.ts` | Server-side Stripe API key. The prefix sets the mode: `sk_test_` / `rk_test_` (sandbox) or `sk_live_` / `rk_live_` (live). Empty disables Stripe | **Yes** |
| `STRIPE_WEBHOOK_SECRET` | `src/app/api/webhooks/stripe/route.ts` | Signing secret (`whsec_…`) of the matching webhook endpoint. Empty makes the endpoint answer `501` | **Yes** |
| `NEXT_PUBLIC_APP_URL` | `src/app/api/checkout/route.ts`, `paymentSetup()` | Public base URL for Stripe's return and cancel URLs in production. `NEXT_PUBLIC_` values are embedded at build time, so **rebuild after changing it** | No |
| `ENABLE_DEMO_PAYMENTS` | `src/lib/payments/rules.ts` | Development-only simulated payments. Ignored (always off) when `NODE_ENV=production` or with a live Stripe key | No |
| `MOLLIE_API_KEY` | `src/lib/payments/mollie.ts` | Optional second provider | **Yes** |
| `DATABASE_URL`, `AUTH_SECRET` | Prisma, auth | Database connection; session signing | **Yes** |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `src/middleware.ts` | Optional store subdomains | No |
| `NODE_ENV` | Several | Set to `production` by `next build` / `next start` | No |

There is **no** `STRIPE_PUBLISHABLE_KEY` variable. Hosted Checkout does not need one, so don't add it.

---

## 3. Local Test Mode (sandbox) setup

Everything in this section is simulated. **No real money moves, and nothing reaches the client's bank account.**

### 3.1 How configuration is loaded

Next.js loads `.env` from the project root at startup (`.env` is git-ignored). The Stripe client is created once per server process (`stripe()` in `src/lib/payments/stripe.ts`), so **restart `npm run dev` after changing Stripe variables**.

### 3.2 One-time setup

1. In the Stripe Dashboard, open a **sandbox** and copy its secret key (`sk_test_…`) from **Developers → API keys**. Optionally create a restricted key (`rk_test_…`) instead; see §8.1.
2. In the sandbox, open **Settings → Payment methods** and enable the methods to test (card, SEPA Direct Debit, Klarna, …).
3. Install the Stripe CLI (v1.55.3 was used), for example `npm install -g @stripe/cli`, then run `stripe login`.
4. In `.env`, set `STRIPE_SECRET_KEY="<SANDBOX_SECRET_KEY>"` and `ENABLE_DEMO_PAYMENTS="false"`.
5. Forward webhooks. CLI 1.55+ requires the event list:

   ```bash
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded,charge.dispute.created --forward-to localhost:3000/api/webhooks/stripe
   ```

   Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`. Keep this terminal running.
6. Start the app with `npm run dev` (http://localhost:3000).

On Windows PowerShell, npm's `.ps1` shims may be blocked by the execution policy. Use `stripe.cmd …`, or set `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 3.3 Automated checks

| Command | What it does | Result on 29 Oct 2026 |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | ✅ Clean |
| `npm test` | Node test runner over `src/**/*.test.ts` (payment rules, order access) | ✅ 18/18 pass |
| `npm run build` | `prisma generate && next build` | ✅ Succeeds |

There are **no automated end-to-end payment tests** in the repository (❌). The browser QA in §12 was done manually.

### 3.4 Verifying locally

1. Log in as an admin and open `/admin/payments`. It should show **"Stripe is connected (test mode)"** and **"Webhook signing secret is set"**.
2. Run `stripe trigger checkout.session.completed`. The `stripe listen` window should show `[200]`.
3. Buy something at `http://localhost:3000/s/olozzo`. Only the house store `olozzo` accepts orders while `OPEN_STORE_ENABLED = false` in `src/lib/features.ts`.
4. Use Stripe's test payment methods (https://docs.stripe.com/testing):

   | Scenario | Test data | Expected |
   |---|---|---|
   | Success | `4242 4242 4242 4242`, any future expiry, any CVC | Order **Paid / Processing** |
   | 3D Secure | `4000 0025 0000 3155`, then **Complete** | Order Paid |
   | Decline | `4000 0000 0000 9995` | Stripe shows "declined"; order stays unpaid |
   | Dispute | `4000 0000 0000 0259` | Order Paid, then `charge.dispute.created` recorded |
   | SEPA success | IBAN `DE89370400440532013000` | **Pending**, then **Paid** about 3 minutes later (webhook) |
   | SEPA failure | IBAN `DE62370400440532013001` | **Pending**, then **Failed** |

5. Check the results in **Stripe Dashboard → (sandbox) → Payments** and **Workbench → Events / Webhooks**, in the order's **Payment** panel at `/admin/orders/<id>`, and in the server terminal (log lines prefixed `[stripe]`, `[checkout]`, `[payments]`).

---

## 4. Current implementation findings

| # | Area | Status | Evidence / note |
|---|---|---|---|
| F1 | Checkout Session creation (hosted page, `mode: payment`, EUR, server-calculated total as one line item, `metadata.orderId`, `client_reference_id`) | ✅ Verified | `createStripeCheckout()`; 30 sessions matched order totals exactly |
| F2 | Dynamic payment methods (no `payment_method_types`) | ✅ Verified | Sandbox offered card, SEPA, Klarna, Link, PayPal, Revolut Pay, Amazon Pay. The live account's methods are configured separately (🟡) |
| F3 | Idempotent session creation (`idempotencyKey: checkout-session-<orderId>`) and checkout retry reuse (`checkoutKey`, `sameCheckout()`) | ✅ Verified | Retried checkout reopened the same session; a changed cart expired the old one |
| F4 | Server-side re-pricing, VAT per EU country, stock hold | ✅ Verified | `quoteCart()`; all 2,255 variants and 27 VAT rates checked |
| F5 | Session expiry tied to the order's payment window (60 min) | ✅ Verified | `expires_at` = `paymentExpiresAt`; 31 expirations processed |
| F6 | Return URL includes `{CHECKOUT_SESSION_ID}`; return page confirms payment before rendering | ✅ Verified | `startPayment()`, `verifyPayment()` (session must carry this order's ID) |
| F7 | Webhook signature verification on the raw body | ✅ Verified | `constructEvent()`; a forged signature returns `400` |
| F8 | Webhook duplicate handling | ✅ Verified | `StripeEvent` table plus conditional state transitions; a re-sent event caused no duplicate side effects |
| F9 | Webhook acts on current session state (re-fetches, handles out-of-order events) | ✅ Verified | `handleStripeEvent()` → `getStripeSession()` |
| F10 | Webhook failures make Stripe retry (non-2xx) | ✅ Verified (code) | Route returns `500` on processing errors |
| F11 | Delayed payment methods (SEPA): pending, then succeeded or failed | ✅ Verified | `markPaymentPending()`, `async_payment_*` events |
| F12 | Amount and currency mismatch protection | ✅ Verified (code) | `applyCheckoutSession()` flags "Needs review" instead of fulfilling |
| F13 | Fulfilment trigger after payment | ✅ Verified | `markOrderPaid()` creates one `SupplierOrder` per supplier, decrements stock and counts discount use, in a single DB transaction |
| F14 | Full refunds from admin and merchant panels | ✅ Verified | `refundOrderInFull()`; the order becomes Refunded and unshipped supplier orders are cancelled |
| F15 | Refunds made in the Stripe Dashboard synced by webhook | ✅ Verified | `charge.refunded`; full refund closes the order |
| F16 | Partial refunds | 🟡 Partial | Only possible in the Stripe Dashboard; recorded in the event log, order stays Paid |
| F17 | Disputes | ❌ Incomplete | Recorded in the event log only. The order stays Paid and the supplier ships; no alert, no persistent "disputed" state |
| F18 | Test/live mode detection and display | ✅ Verified | `stripeKeyMode()`; `/admin/payments` shows the mode |
| F19 | Application-level Test/Live switch | ➖ / ❌ | None exists. The mode follows the configured key (by design). See the Mode Guide |
| F20 | Guard against sandbox keys in production | ❌ Missing | Production starts normally with a `sk_test_` key; only the admin page reveals it |
| F21 | Demo payments blocked in production and next to live keys | ✅ Verified | `demoPaymentsAllowed()`; unit-tested |
| F22 | Secret key kept server-side | ✅ Verified | Stripe modules import `server-only`; no client-side Stripe code |
| F23 | Guest order page privacy | ✅ Verified | Token hash plus `canViewOrder()`; production build checked. In `next dev`, React's debug data embeds the order in the locked page, so never expose a dev server publicly |
| F24 | Adaptive Pricing (local-currency display) | 🟡 Account setting | Enabled in the sandbox; settlement stays in EUR and the amount check still passes. The live account setting must be reviewed |
| F25 | Customer confirmation emails | ❌ Missing | No transactional email in the app (README "Not included yet"). Stripe email receipts can be enabled in the Dashboard |
| F26 | Monitoring and alerting | ❌ Missing | Logs go to stdout only; no error tracker, uptime or alerting is configured |
| F27 | Health-check endpoint | ❌ Missing | None. Use the webhook probe in the runbook §6 |
| F28 | Payouts to merchants or suppliers | ➖ / ❌ | All money lands in the single platform Stripe account. Paying suppliers or merchants happens outside Stripe (Stripe Connect is not implemented) |
| F29 | Production hosting, domain, deployment method, process manager | ❓ Unknown | No Dockerfile, PM2, systemd, Nginx or CI files. `.vercel` in `.gitignore` and the README suggest Vercel and Neon, **unconfirmed** |
| F30 | Integration committed and merged | ❌ No | Branch `stripe-integration-hardening` has about 35 uncommitted changed files |
| F31 | Live Stripe account ownership and activation | ❓ Unknown | The sandbox used locally belongs to an account named "New business". Whether it is the client's account, and its activation status, must be confirmed |
| F32 | Production database seeded with demo data | ❓ Unknown | `npm run setup` / `db:seed` create demo accounts with a published password (`Demo1234!`). If production was seeded, those accounts must be removed or their passwords changed |

---

## 5. Client Stripe account requirements (summary)

Full, non-technical steps are in the [Client Setup Guide](Olozzo_Stripe_Client_Setup_Guide.md). In short:

- The **client owns** the Stripe account that receives Olozzo.com's revenue, registered in the **country of the legally registered business**. That country cannot be changed after activation.
- The client completes business verification in the Dashboard (https://dashboard.stripe.com/account/onboarding). Requirements depend on the country, business type and account status.
- The client sets public business details: name, website, support email, phone, statement descriptor.
- The client adds a payout bank account and reviews the payout schedule.
- The client invites the developer as a **team member with limited access** (https://docs.stripe.com/get-started/account/teams) rather than sharing a login.

## 6. Business verification (summary)

Stripe's "Know Your Customer" (KYC) checks cover the business, its representative and, where required, its owners. Stripe may ask for documents later, for example as volume grows. Requests appear in the Dashboard and by email from a `stripe.com` address. The client supplies documents **directly to Stripe**, never through the developer. Source: https://docs.stripe.com/get-started/account/activate

## 7. Bank account and payout setup (summary)

```
Customer pays on Olozzo.com → Stripe processes the payment
→ Stripe balance shows the payment minus Stripe fees (and any refunds or disputes)
→ Funds become "available" after the settlement period
→ Stripe pays out available funds on the payout schedule
→ Funds arrive in the client's verified bank account
```

- Bank account: Dashboard **Settings → Money management (Payout settings)** (https://dashboard.stripe.com/settings/money-management). The bank account currency must match the payout currency.
- The **first payout** typically arrives 7–14 days after the first successful live payment. Later timing depends on country, payment method (for example, SEPA Direct Debit settles more slowly than cards) and risk. Source: https://docs.stripe.com/payouts
- Olozzo charges in **EUR**. If the client's settlement currency is not EUR, Stripe converts unless EUR settlement is enabled (https://docs.stripe.com/payouts/multi-currency-settlement).
- Fees: see https://stripe.com/pricing. This guide does not quote amounts.

---

## 8. Production credentials

### 8.1 Which key to use

| Option | Recommendation |
|---|---|
| **Restricted key** `rk_live_…` | **Recommended** by Stripe. Minimum permissions for this code: **Checkout Sessions: Write** (create, retrieve, expire), **Refunds: Write**, **PaymentIntents: Read**. Webhook endpoints are managed in the Dashboard, not through the API. 🟡 Verify these permissions in staging before live use; a missing permission surfaces as an authentication or permission error in the server log |
| Secret key `sk_live_…` | Works with no further setup, but has unrestricted access |

Stripe shows a live key you create yourself **only once**. Store it in the hosting platform's secret manager immediately. Source: https://docs.stripe.com/keys

### 8.2 Handling rules

- The **client** creates or reveals the live key in their own Dashboard (or a developer with a sufficient team role does). Transfer it only through the hosting provider's secret manager or a password manager share, never by email or chat.
- Put live keys only in the production environment's protected configuration. Never in Git, `.env.example`, build logs, tickets or this documentation.
- Apply a Stripe **access policy** (IP or ASN allow-list) to live keys where the host has stable egress (https://docs.stripe.com/keys#access-policies).
- Rotate any key that has ever been pasted outside a secret store (Stripe's go-live checklist).
- Verify that no key is in the client bundle: after `npm run build`, search `.next/static` for `sk_live`, `rk_live` and `whsec_`. There should be no matches (Deployment Guide command C-A9).

## 9. Webhook configuration

| Item | Value |
|---|---|
| Route | `POST /api/webhooks/stripe` (`src/app/api/webhooks/stripe/route.ts`) |
| Production URL | `https://<PRODUCTION_DOMAIN>/api/webhooks/stripe` (❓ domain to be confirmed) |
| Events (exactly these six; source `STRIPE_WEBHOOK_EVENTS`) | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created` |
| Payload type | **Snapshot** events. The handler uses `webhooks.constructEvent()`; thin events are not supported by this code |
| API version for the endpoint | `2026-09-30.endive` (matches `stripe@23.0.1`) |
| Secret variable | `STRIPE_WEBHOOK_SECRET`, the **live** endpoint's `whsec_…`. Sandbox and live endpoints have different secrets |

Behaviour (✅ verified):

- Invalid or missing signature → `400`, not processed. Stripe's library also rejects signatures older than 5 minutes (replay protection).
- Unconfigured (`STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` empty) → `501`.
- Processing error → `500`, and Stripe retries for up to 3 days in live mode.
- Duplicates → ignored through the `StripeEvent` table and conditional updates.
- Out-of-order or late events → the session is re-fetched from Stripe before acting.
- When a `checkout.session.completed` endpoint is registered, Stripe waits up to 10 seconds for it before redirecting the customer, so the endpoint must answer quickly. Processing is a few DB writes plus one Stripe API call.

Monitoring: **Dashboard → Workbench → Webhooks → (endpoint) → Event deliveries**, plus `/admin/payments` (latest 15 events) and each order's Payment panel.

## 10. Live server preparation and deployment

The executable procedure is in the [Production Runbook](Olozzo_Stripe_Production_Runbook.md). Prerequisites in brief:

1. Commit, review and merge the `stripe-integration-hardening` work, then tag the release.
2. Back up the production database, preview the schema change, and apply it (additive: new nullable/defaulted columns and the `StripeEvent` table).
3. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_APP_URL` (HTTPS) in the host's secret store, and confirm `ENABLE_DEMO_PAYMENTS` is not `true`.
4. Build and deploy with Node ≥ 20, then verify `/admin/payments` shows **live mode** and the webhook probe returns `400 Missing signature`.
5. Register the live webhook endpoint, run a client-authorised real payment and refund, then monitor.

## 11. Test Mode ON/OFF (summary)

See the [Test/Live Mode Guide](Olozzo_Stripe_Test_Live_Mode_Guide.md). Key points:

- Switching the Dashboard between sandbox and live **does not** change the website. Only the configured `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` do.
- There is no application switch, and **putting sandbox keys on the production site is unsafe**: simulated payments become Paid orders, create supplier orders and appear in revenue.
- Recommended: a separate **staging** deployment with its own database and sandbox keys.

## 12. Payment testing matrix

Environment: **S** = local or staging with sandbox keys; **P** = production with live keys, only with client authorisation. Results in the last column are from the 29 Oct 2026 sandbox QA.

| # | Scenario | Env | Steps | Expected Stripe result | Expected website / DB | Logs to inspect | QA |
|---|---|---|---|---|---|---|---|
| T1 | Successful payment | S | Pay with `4242…` | PaymentIntent `succeeded`, session `complete/paid` | Order Paid / Processing; one `SupplierOrder` per supplier; stock released then decremented; event `checkout.session.completed` | Webhook deliveries `[200]`; `/admin/payments` events | ✅ |
| T2 | Declined card | S | `4000 0000 0000 9995` | Stripe shows the decline; session stays open | Order stays Unpaid / Pending; customer can retry on the same page | Stripe Payments shows a failed attempt | ✅ |
| T3 | Failed delayed payment | S | SEPA IBAN `DE62370400440532013001` | `async_payment_failed` | Pending, then Failed / Cancelled; stock released | Event `checkout.session.async_payment_failed` | ✅ |
| T4 | Cancelled checkout | S | Click ← on Stripe's page | Session stays open | `/checkout?cancelled=1` with "Payment was cancelled"; cart kept; **Buy now** reopens the same session | none | ✅ |
| T5 | 3D Secure | S | `4000 0025 0000 3155`, Complete | `succeeded` after authentication | Order Paid | none | ✅ |
| T6 | Duplicate submission | S | Submit checkout twice / retry | Same session URL (idempotency key) | One order | none | ✅ |
| T7 | Webhook retry / duplicate | S | `stripe events resend <evt_id>` | Delivered again | No second `order.paid`, no extra supplier orders | Webhook `[200]`; one `StripeEvent` row | ✅ |
| T8 | Customer closes the browser before returning | S | Pay, close the tab immediately | `succeeded` | Order still Paid via webhook | Event recorded with the order ID | 🟡 Webhook-only path verified with SEPA and expiry events; repeat with a card in staging |
| T9 | Payment succeeds but order not updated | S | Stop `stripe listen`, pay, don't return; then admin **Sync payment** | `succeeded` | Unpaid until synced, then Paid | `order.payment_synced` audit | 🟡 To run in staging |
| T10 | Full refund (admin) | S | Admin order → **Refund** | Refund `succeeded` | Order Refunded; unshipped supplier orders Cancelled | `charge.refunded` | ✅ |
| T11 | Refund in Stripe Dashboard (full / partial) | S | Refund in Dashboard | Refund `succeeded` | Full → Refunded; partial → stays Paid, logged | `charge.refunded` | ✅ |
| T12 | Dispute | S | `4000 0000 0000 0259` | Dispute created | Order stays Paid; event logged only (F17) | `charge.dispute.created` | ✅ (gap noted) |
| T13 | Wrong webhook secret | S | Set a wrong `STRIPE_WEBHOOK_SECRET`, restart, trigger an event | Delivery fails `400`; Stripe retries | No change to orders | Server log `[stripe] invalid webhook signature` | ✅ (forged signature) |
| T14 | Invalid API key | S | Set a wrong key, restart, start checkout | Authentication error | Checkout shows "We could not start the payment"; order marked Failed | Server log `[checkout] payment start failed` | 🟡 To run in staging |
| T15 | Sandbox key in production | P (inspection only) | Open `/admin/payments` | none | Shows **test mode**, which is a launch blocker. Stripe's page would show a "Sandbox" badge | none | Procedure only |
| T16 | Session expiry | S | Expire the session (Dashboard/API) or wait 60 min | `checkout.session.expired` | Failed / Cancelled; stock released | Event recorded | ✅ |
| T17 | Forged webhook | S/P | `curl` with a fake `stripe-signature` | none | `400 Invalid signature` | none | ✅ |
| T18 | Controlled real payment | P | See Runbook §8 | Live charge, then refund | Order Paid, then Refunded | Live event deliveries | Not run (needs client authorisation) |

## 13. Production readiness checklist

| # | Item | Owner |
|---|---|---|
| ☐ | Stripe account owned by the client, business verified, charges and payouts enabled | Client |
| ☐ | Payout bank account added and verified; payout schedule reviewed | Client |
| ☐ | Public details, statement descriptor and support email set | Client |
| ☐ | Live payment methods enabled (Settings → Payment methods, live mode) | Client + Developer |
| ☐ | Adaptive Pricing, email receipts and Radar settings reviewed in live mode | Client + Developer |
| ☐ | Integration committed, reviewed, merged and tagged | Developer |
| ☐ | Production DB backed up; schema change previewed and applied | Developer |
| ☐ | Live `STRIPE_SECRET_KEY` (preferably `rk_live_`) and live `STRIPE_WEBHOOK_SECRET` in the host secret store | Developer |
| ☐ | `NEXT_PUBLIC_APP_URL=https://<PRODUCTION_DOMAIN>`; HTTPS valid | Developer |
| ☐ | `ENABLE_DEMO_PAYMENTS` unset or `false`; build runs with `NODE_ENV=production` | Developer |
| ☐ | Live webhook endpoint registered (6 events, snapshot, `2026-09-30.endive`) | Developer |
| ☐ | `/admin/payments` shows **live mode** and the webhook secret is set | Developer |
| ☐ | Webhook probe returns `400 {"error":"Missing signature"}` | Developer |
| ☐ | Demo accounts absent or passwords changed in production (F32) | Developer |
| ☐ | Controlled real payment and refund done with written client approval | Both |
| ☐ | Dispute handling agreed (F17) and first-week monitoring owner named | Both |

## 14. Security requirements

| Requirement | Status |
|---|---|
| Card data handled only by Stripe's hosted page (PCI scope minimised). Stripe's security guide covers validation for Checkout integrations: https://docs.stripe.com/security/guide | ✅ By design |
| Secret key and webhook secret only on the server (`server-only` imports) | ✅ |
| Webhook signature verification with timestamp tolerance | ✅ |
| Prices and totals computed on the server; amount check before fulfilment | ✅ |
| Guest order pages need a private token (stored hashed) | ✅ |
| Payment mode cannot be changed by URL or user input | ✅ (no such switch exists) |
| HTTPS on production | ❓ Host unknown |
| Restricted live key with an access policy | 🟡 Recommended |
| Two-factor authentication for every Stripe Dashboard user | 🟡 Client action |
| Never run `next dev` publicly (debug data exposure, F23) | Operational rule |
| No secrets in logs: code logs event types and IDs only | ✅ (code review) |

## 15. Troubleshooting

| Symptom | Likely cause | Investigate | Fix |
|---|---|---|---|
| Checkout shows "We could not start the payment" | Invalid, expired or wrong-mode key; restricted key lacks a permission | Developer | Check the server log `[checkout] payment start failed` and Stripe **Workbench → Logs**; replace the key; restart |
| `/admin/payments` shows **test mode** on production | Sandbox key configured | Developer | Replace with the live key; redeploy (Mode Guide §4) |
| Stripe option missing at checkout | `STRIPE_SECRET_KEY` empty in that environment | Developer | Set it; restart or redeploy |
| Webhook deliveries `400` | Signing secret doesn't match this endpoint or mode | Developer | Copy the endpoint's `whsec_` (live vs sandbox); restart |
| Webhook deliveries `501` | Stripe variables empty on the server | Developer | Set both; restart |
| Webhook deliveries `500` | DB error or Stripe API error during processing | Developer | Server log `[stripe] failed to process …`; Stripe retries automatically after the fix |
| Webhook "unable to connect" / timeout / `3xx` | Wrong URL, firewall, redirect (e.g. www ↔ apex) | Developer | Register the exact final HTTPS URL; open the route; allow Stripe IPs (https://docs.stripe.com/ips) |
| Paid in Stripe, order still Unpaid | Missed webhook | Developer | Admin order → **Sync payment**; then fix delivery |
| Order shows "Needs review" | Charged amount or currency ≠ order total | Developer | Compare in Stripe; refund or fulfil manually |
| Duplicate orders | Customer started separate checkouts with different carts | Developer | Old unpaid orders are cancelled automatically; check `checkoutKey` |
| Simulated payments created real supplier orders | Sandbox keys on production | Both | Restore live keys; cancel the affected supplier orders manually; exclude them from reports |
| Live card declines | Issuer decline, Radar, 3DS failure | Client (customer service) + Developer | Stripe Payments → payment → decline reason |
| "Payments" or "Payouts" disabled banner | Verification requirement outstanding | Client | Dashboard notification → provide the requested information |
| Payout failed or pending long | Wrong bank details, currency mismatch, new-account delay, bank holiday | Client | Settings → Money management; Stripe support |
| Refund fails | Insufficient Stripe balance, or payment already refunded | Both | Server log `[admin] refund failed`; Dashboard balance |
| Wrong mode after a restart or deploy | Environment scope (preview vs production) or stale build | Developer | Check the host's environment scopes; redeploy; re-check `/admin/payments` |
| `No such checkout.session` errors in logs | Old sessions from the other mode after a key switch | Developer | Expected after mode changes; see the Mode Guide risks |

## 16. Rollback procedures (summary)

Full steps are in the [Runbook](Olozzo_Stripe_Production_Runbook.md) §10.

- **Code rollback:** redeploy the previous release. The schema change is additive, so the previous code should run against the updated schema (🟡 verify in staging), and the database does not need to be rolled back.
- **Before rolling back:** note open Checkout Sessions (orders Unpaid with `paymentExpiresAt` in the future). Afterwards, reconcile recent Stripe payments against orders with **Sync payment**.
- **Key rollback:** if a new key fails, restore the previous key from the secret store's version history and redeploy. Webhooks that failed meanwhile are retried by Stripe for up to 3 days.

## 17. Official Stripe references

| Topic | URL |
|---|---|
| API keys, sandbox vs live mode, access policies | https://docs.stripe.com/keys |
| Restricted API keys | https://docs.stripe.com/keys/restricted-api-keys |
| Key best practices | https://docs.stripe.com/keys-best-practices |
| Sandboxes | https://docs.stripe.com/sandboxes |
| Testing (cards, IBANs, disputes) | https://docs.stripe.com/testing |
| Online payments overview | https://docs.stripe.com/payments |
| Stripe Checkout | https://docs.stripe.com/payments/checkout |
| Fulfil orders (Checkout) | https://docs.stripe.com/checkout/fulfillment |
| Webhooks | https://docs.stripe.com/webhooks |
| Webhook signature verification | https://docs.stripe.com/webhooks/signature |
| Webhook IP addresses | https://docs.stripe.com/ips |
| Go-live checklist | https://docs.stripe.com/get-started/checklist/go-live |
| Account activation / verification | https://docs.stripe.com/get-started/account/activate |
| Account checklist | https://docs.stripe.com/get-started/account/checklist |
| Team members and roles | https://docs.stripe.com/get-started/account/teams |
| Payouts and payout schedules | https://docs.stripe.com/payouts |
| Multi-currency settlement | https://docs.stripe.com/payouts/multi-currency-settlement |
| Pricing | https://stripe.com/pricing |
| Refunds | https://docs.stripe.com/refunds |
| Disputes / responding | https://docs.stripe.com/disputes · https://docs.stripe.com/disputes/responding |
| Security and PCI | https://docs.stripe.com/security/guide |
| Dynamic payment methods | https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods |
| Adaptive Pricing | https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing |
| Email receipts | https://docs.stripe.com/receipts |
| API upgrades / versions | https://docs.stripe.com/upgrades |
| Stripe CLI `listen` | https://docs.stripe.com/cli/listen |

Official Stripe requirements in this guide: KYC verification, signature verification, live and sandbox separation, key handling. Recommended engineering practices: staging, restricted keys, access policies, monitoring, controlled real-payment test.
