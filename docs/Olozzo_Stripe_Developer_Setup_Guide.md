# Olozzo.com: Developer Setup Guide (Start Here)

For a developer joining the project. It takes you from a fresh clone to working Stripe test payments on your machine, then points you to the documents for putting Stripe live on the site.

| Step | Document |
|---|---|
| 1. Set up locally with Stripe test mode | **This guide** |
| 2. Understand the integration (architecture, findings, test matrix) | [Integration Guide](Olozzo_Stripe_Live_Integration_Guide.md) |
| 3. Prepare and run the production deployment | [Live Deployment Guide](Olozzo_Stripe_Live_Deployment_Guide.md) → [Production Runbook](Olozzo_Stripe_Production_Runbook.md) |
| 4. Collect sign-offs | [Launch Checklist](Olozzo_Stripe_Launch_Checklist.md) |
| 5. Test vs live keys, staging | [Test/Live Mode Guide](Olozzo_Stripe_Test_Live_Mode_Guide.md) |
| For the business owner | [Client Setup Guide](Olozzo_Stripe_Client_Setup_Guide.md) |

> Everything in this guide uses Stripe's **sandbox (test mode)**: no real money moves. Never put live keys (`sk_live_…`, `rk_live_…`) on a development machine.

---

## 1. What you need

| Requirement | Notes |
|---|---|
| Git access | `https://github.com/nishilwork11/olozzo` (ask the project owner) |
| Node.js **20 or newer** | Required by `stripe@23`; tested on 22.15.0. Check with `node -v` |
| npm | Comes with Node; the project uses `package-lock.json` |
| PostgreSQL database | Your own development database, e.g. a free Neon project or Neon branch, or local Postgres. **Never the production database** |
| Stripe account with a sandbox | Your own account or a sandbox in the client's account (ask the client to invite you as a team member). Sign up at https://dashboard.stripe.com/register |
| Stripe CLI | To receive webhooks locally (step 5) |

## 2. Get the code

```bash
git clone https://github.com/nishilwork11/olozzo.git
cd olozzo
git checkout <BRANCH>        # the branch with the Stripe work, once pushed (e.g. stripe-integration-hardening or main after merge)
npm install
```

## 3. Environment file

Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Value for local development |
|---|---|
| `DATABASE_URL` | Your development Postgres connection string |
| `AUTH_SECRET` | A long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` (in development the app uses the actual port automatically) |
| `STRIPE_SECRET_KEY` | Your **sandbox** secret key `sk_test_…` (step 4) |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_…` printed by `stripe listen` (step 5) |
| `ENABLE_DEMO_PAYMENTS` | `"false"`, so checkout shows only Stripe |
| `MOLLIE_API_KEY` | Leave empty |

`.env` is git-ignored. Never commit it, and never paste keys into chat or tickets.

## 4. Stripe sandbox setup (Stripe Dashboard)

1. Sign in at https://dashboard.stripe.com and open a **sandbox** (account picker → Sandboxes). The Dashboard shows a "Sandbox" / test badge.
2. **API key:** Developers → **API keys** → copy the **Secret key** (`sk_test_…`) into `STRIPE_SECRET_KEY`.
   - Optional, closer to production: create a **restricted key** (`rk_test_…`) with **Checkout Sessions: Write**, **Refunds: Write**, **PaymentIntents: Read**. If checkout, refunds and webhooks all work with it, those permissions are confirmed for the live key too.
3. **Payment methods:** Settings → **Payment methods** → enable what you want to test (Cards are on by default; add SEPA Direct Debit, Klarna, etc.). The code doesn't list payment methods; Stripe shows whatever is enabled here.
4. No publishable key is needed: the site uses Stripe's hosted Checkout page.

## 5. Stripe CLI (webhooks to localhost)

Install and log in:

```bash
npm install -g @stripe/cli
stripe login
```

Windows notes:
- If `stripe` is "not recognized", npm's global folder isn't on PATH. Add `%APPDATA%\npm` to your user Path (Environment Variables), then open a **new** terminal.
- In PowerShell, if scripts are blocked, run `stripe.cmd` instead of `stripe`, or allow local scripts once with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Start forwarding. CLI 1.55+ requires the event list; keep this terminal open while you work:

```bash
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded,charge.dispute.created --forward-to localhost:3000/api/webhooks/stripe
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`. The secret stays the same for your machine and account, so you only do this once.

## 6. Database and demo data

```bash
npm run setup            # creates the tables in DATABASE_URL and seeds demo data (WIPES that database)
npm run db:seed-catalog  # adds the "olozzo" house store and the shop catalog (additive)
```

`npm run setup` and `npm run db:reset` **delete everything** in `DATABASE_URL`. Only run them against your own development database.

Demo logins (password `Demo1234!`, from `prisma/seed.ts`): admin `admin@olozzo.com`, customer `customer@olozzo.com`, merchants and suppliers as listed in the project README.

## 7. Run the app

```bash
npm run dev              # http://localhost:3000
```

Restart `npm run dev` whenever you change `.env`.

## 8. Check that Stripe works

| # | Check | Expected |
|---|---|---|
| 1 | Log in as `admin@olozzo.com` → http://localhost:3000/admin/payments | ✅ "Stripe is connected (test mode)", ✅ "Webhook signing secret is set" |
| 2 | In a third terminal: `stripe trigger checkout.session.completed` | The `stripe listen` window shows lines ending in `[200]` |
| 3 | Buy something at http://localhost:3000/s/olozzo (only the **olozzo** store takes orders while `OPEN_STORE_ENABLED = false` in `src/lib/features.ts`) | Redirect to Stripe's page with a "Sandbox" badge |
| 4 | Pay with `4242 4242 4242 4242`, any future date, any CVC | Back on the order page: "Your payment is confirmed"; `/admin/orders` shows **Paid / Processing**; `stripe listen` shows `checkout.session.completed [200]` |

More test cases (3D Secure, decline, SEPA, dispute, refunds) are in the [Integration Guide](Olozzo_Stripe_Live_Integration_Guide.md) §3.4 and §12. Stripe's full list of test data is at https://docs.stripe.com/testing.

Automated checks:

```bash
npm run typecheck        # no output = OK
npm test                 # all tests pass
npm run build            # production build compiles
```

## 9. Where the Stripe code lives

| What | File |
|---|---|
| Create Checkout Session, refunds, expiry | `src/lib/payments/stripe.ts` |
| Start, verify, refund payments (all providers) | `src/lib/payments/index.ts` |
| Webhook event handling (order updates) | `src/lib/payments/stripe-events.ts` |
| Webhook endpoint | `src/app/api/webhooks/stripe/route.ts` |
| Checkout API (validation, re-pricing, order creation) | `src/app/api/checkout/route.ts`, `src/lib/checkout.ts` |
| Order state changes and supplier routing | `src/lib/orders.ts` |
| Admin payment tools | `src/app/admin/payments/page.tsx`, `src/app/admin/orders/[id]/page.tsx` |
| Unit-tested payment rules | `src/lib/payments/rules.ts` |

Ground rules when changing payment code:
- Prices are always computed on the server.
- Every order state change is a conditional update (safe to repeat).
- Webhook events are verified and de-duplicated.
- Secrets stay in server-only modules.

## 10. Common problems

| Problem | Fix |
|---|---|
| No Stripe option at checkout | `STRIPE_SECRET_KEY` empty, or `npm run dev` not restarted |
| "This store isn't taking orders" | Use the `olozzo` store (`/s/olozzo`); run `npm run db:seed-catalog` if it doesn't exist |
| `stripe listen` shows `[400]` | `STRIPE_WEBHOOK_SECRET` doesn't match; copy the `whsec_` again and restart |
| `stripe listen` shows `[501]` | Stripe variables empty; restart after setting them |
| `must specify events to forward` | Use the full `stripe listen --events …` command from step 5 |
| Stripe page shows rupees, dollars etc. | Stripe's Adaptive Pricing shows a local currency; you're still charged in EUR. Choose € on the page |
| Order stays unpaid after paying | Check the `stripe listen` window and the `npm run dev` output for `[stripe]` errors; admin order page → **Sync payment** |

## 11. Putting Stripe live on the site

Don't do this from a development machine, and not without the approvals. Follow, in order:

1. [Launch Checklist](Olozzo_Stripe_Launch_Checklist.md) parts A–C (client account, developer and server prerequisites).
2. [Live Deployment Guide](Olozzo_Stripe_Live_Deployment_Guide.md): blockers (§2.2), configuration (§4–§6), command catalog (§7).
3. [Production Runbook](Olozzo_Stripe_Production_Runbook.md): the step-by-step sequence with approval gates G0–G6.
4. [Launch Checklist](Olozzo_Stripe_Launch_Checklist.md) parts D–E: approvals, real-payment test, sign-off.
