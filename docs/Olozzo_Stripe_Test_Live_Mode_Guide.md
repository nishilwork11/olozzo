# How to Enable and Disable Stripe Test Mode on the Deployed Olozzo.com Website

| | |
|---|---|
| **Audience** | Developers and operators; §2 is also useful for the client |
| **Applies to** | Branch `stripe-integration-hardening` (Next.js 15, `stripe@23.0.1`) |
| **Related** | [Integration Guide](Olozzo_Stripe_Live_Integration_Guide.md) · [Production Runbook](Olozzo_Stripe_Production_Runbook.md) |

Stripe now calls its test environment a **sandbox**; older screens and documents say **test mode**. In this guide, "Test Mode" means using **sandbox keys**.

---

## 1. Key finding: the application has no Test/Live switch

The payment mode of a running Olozzo.com deployment is decided by **one thing**: the prefix of `STRIPE_SECRET_KEY` in that deployment's environment (`stripeKeyMode()` in `src/lib/payments/rules.ts`).

| `STRIPE_SECRET_KEY` prefix | Mode | Money moves? |
|---|---|---|
| `sk_live_` / `rk_live_` | **Live** | Yes |
| `sk_test_` / `rk_test_` | **Sandbox (Test Mode)** | No, simulated |
| empty | Stripe disabled (not offered at checkout) | none |

There is no admin toggle, URL parameter or database flag, and **that is the safe design**: nobody can change the mode from a browser.

**Consequence:** on a deployment, "turning Test Mode on" means **replacing the production keys with sandbox keys**. On a shared production site this is **unsafe**:

- Simulated payments mark orders **Paid**. That runs `markOrderPaid()` (`src/lib/orders.ts`), which **creates supplier orders**, decrements stock and counts discount use, exactly as for a real sale. Suppliers would see and might ship them.
- Simulated orders appear in admin and merchant **revenue and profit** figures; nothing distinguishes them except the `cs_test_…` reference.
- Real customers shopping at the same time would see a Stripe **"Sandbox"** page and could not pay.
- Existing live orders become unmanageable during the switch: refunds and **Sync payment** fail (`No such checkout.session`), because live objects don't exist in the sandbox.
- Live webhooks arriving during the switch fail signature checks (`400`). Stripe retries them for up to 3 days, so they are processed once live keys are restored.

**Recommendation:** test on a **separate staging deployment** with its own database and sandbox keys, and keep production permanently in live mode. Switching production to sandbox keys should be an emergency-only procedure (§4) with the safeguards listed there.

If a safe in-production test mode is ever wanted, it needs development work, proposed here but **not implemented**: mark orders created with sandbox keys as test orders, exclude them from supplier routing and revenue, refuse sandbox keys in production unless an explicit server-side flag is set, and show a site-wide "test mode" banner.

## 2. Four things that are easy to confuse

| Concept | What it is | Changes the website? |
|---|---|---|
| **Dashboard view** (sandbox ⇄ live in the account picker) | Which data **you see** in the Stripe Dashboard | **No** |
| **Website credentials** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) | Which Stripe environment the **server** talks to | **Yes**: this *is* the website's mode |
| **Application-level mode** | none in this codebase | ➖ |
| **Webhook endpoints** | Registered **separately** in sandbox and in live, each with its own `whsec_…` secret | Yes: the secret must match the key's mode |

Environments:

| Environment | Database | Stripe keys | Webhook source |
|---|---|---|---|
| Local | developer's DB | sandbox | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` |
| **Staging** (recommended; ❓ not yet existing) | **separate** DB | sandbox | sandbox endpoint `https://<STAGING_DOMAIN>/api/webhooks/stripe` |
| Production | production DB | **live** | live endpoint `https://<PRODUCTION_DOMAIN>/api/webhooks/stripe` |

Sandbox and live data are completely separate: customers, payments, refunds, payment-method settings, webhook endpoints and keys. Nothing created in one exists in the other. Olozzo creates prices on the fly (`price_data`), so no Stripe Product or Price objects need copying.

## 3. How to identify the active mode

| Method | Where | Shows |
|---|---|---|
| Admin setup checklist | `/admin/payments` (admin login) | "Stripe is connected (**test mode**)" or "(**live mode**)", whether the webhook secret is set, demo payments on/off |
| Stripe's payment page | Start a checkout and look before paying | A **"Sandbox"** badge means sandbox keys |
| Order references | Admin order → Payment panel / DB `Order.paymentRef` | `cs_test_…` = sandbox, `cs_live_…` = live |
| Server environment ([Node host]) | `node -e 'const k=process.env.STRIPE_SECRET_KEY\|\|"";console.log(/^(sk\|rk)_live_/.test(k)?"live":/^(sk\|rk)_test_/.test(k)?"TEST":"missing")'` | Mode only, never the key |
| Host secret store | e.g. `vercel env ls production` | Variable **names** only; the mode isn't visible there |

Never print a key to check it.

## 4. Enable Test Mode

### 4A. Recommended: on staging

1. Create a staging deployment (separate host project or service) with its **own database**. Never point staging at the production DB.
2. Set `STRIPE_SECRET_KEY=<SANDBOX_KEY>`, `NEXT_PUBLIC_APP_URL=https://<STAGING_DOMAIN>`, and `STRIPE_WEBHOOK_SECRET` = the secret of a **sandbox** webhook endpoint registered for `https://<STAGING_DOMAIN>/api/webhooks/stripe` (same six events, snapshot payload, API version `2026-09-30.endive`; see the Runbook §4.2).
3. Build and deploy staging, then check `/admin/payments` shows **test mode**.
4. Run the test matrix (Integration Guide §12) with Stripe test cards and IBANs only.
5. Record the results.

### 4B. Emergency only: on the production deployment

Use only if staging is impossible, with every step below:

1. **Written client authorisation** with a time window.
2. **Notify** testers that payments are simulated, and suppliers that orders in the window are not real.
3. **Protect customers:** choose a quiet window. Because the app has no maintenance mode, real customers *will* reach the sandbox page during the window.
4. Note the current time and the list of Unpaid or Pending live orders (to reconcile afterwards).
5. Replace `STRIPE_SECRET_KEY` with the **sandbox** key and `STRIPE_WEBHOOK_SECRET` with the secret of a **sandbox** endpoint registered for the production URL. Never mix: a sandbox key with a live secret, or the reverse, makes every webhook fail.
6. Redeploy or restart (Runbook §5).
7. Verify `/admin/payments` shows **test mode** and Stripe's page shows **Sandbox**.
8. Run only the agreed tests.
9. **Clean up test effects:** cancel every supplier order created for test orders (`paymentRef` starting `cs_test_`), and exclude these orders from revenue reporting. Stock decremented by test orders must be corrected manually.
10. Restore Live Mode immediately (§5).

## 5. Disable Test Mode and restore Live Mode

1. Stop testing and tell testers to stop.
2. Confirm client authorisation to (re)enable live payments.
3. Confirm in the Stripe Dashboard that the client's account can accept live payments (no outstanding verification).
4. Set `STRIPE_SECRET_KEY` to the **live** key (`rk_live_…` / `sk_live_…`).
5. Set `STRIPE_WEBHOOK_SECRET` to the **live** endpoint's secret.
6. Confirm the live webhook endpoint exists for `https://<PRODUCTION_DOMAIN>/api/webhooks/stripe` with the six events. No other Stripe object IDs are configured in this app; sessions are created per order.
7. Remove any temporary overrides, e.g. sandbox variables in other scopes, and make sure `ENABLE_DEMO_PAYMENTS` isn't `true`.
8. Redeploy or restart.
9. Verify: `/admin/payments` shows **live mode**; the webhook probe (`curl -X POST …/api/webhooks/stripe`) returns `400 Missing signature`; Stripe's page shows no Sandbox badge (open it, don't pay).
10. Check production health: logs free of Stripe errors; webhook deliveries `200`. Live events that failed during the window are retried by Stripe; check deliveries and use admin **Sync payment** on the orders noted in §4B step 4.
11. A real-payment test needs **separate written approval** (Runbook §7).
12. Monitor the first real transactions (Runbook §8).

## 6. Checklists

**Test Mode ON (staging)**

| ☐ | Item |
|---|---|
| ☐ | Separate database confirmed |
| ☐ | `STRIPE_SECRET_KEY` starts with `sk_test_` / `rk_test_` |
| ☐ | `STRIPE_WEBHOOK_SECRET` belongs to the **sandbox** endpoint for this URL |
| ☐ | `NEXT_PUBLIC_APP_URL` is the staging URL (rebuilt after setting it) |
| ☐ | `/admin/payments` shows test mode; Stripe's page shows Sandbox |
| ☐ | Only Stripe test cards and IBANs used |

**Live Mode ON (production)**

| ☐ | Item |
|---|---|
| ☐ | Client authorisation on file |
| ☐ | Stripe account active; payouts configured |
| ☐ | `STRIPE_SECRET_KEY` starts with `rk_live_` / `sk_live_` |
| ☐ | `STRIPE_WEBHOOK_SECRET` belongs to the **live** endpoint |
| ☐ | `NEXT_PUBLIC_APP_URL=https://<PRODUCTION_DOMAIN>` |
| ☐ | Demo payments off; `/admin/payments` shows live mode |
| ☐ | Webhook probe returns `400 Missing signature`; deliveries `200` |
| ☐ | No `cs_test_` orders created after the switch |

## 7. Risks of changing modes on a live website

| Risk | Impact |
|---|---|
| Simulated payments fulfil orders | Supplier orders for unpaid goods; stock and revenue distorted |
| Real customers hit the sandbox page | Lost sales; confusion |
| Mixed key and secret modes | Every webhook fails (`400`); orders confirmed only by the return page |
| Live objects unreachable while in sandbox | Refunds and payment sync fail for live orders |
| Forgetting to switch back | No real revenue collected |
| `NEXT_PUBLIC_APP_URL` changed without rebuild | Customers sent back to the wrong domain after paying |

## 8. Troubleshooting and rollback

| Symptom | Cause | Fix |
|---|---|---|
| `/admin/payments` still shows the old mode | Not redeployed or restarted; wrong environment scope (e.g. Vercel Preview vs Production) | Redeploy; check the scope |
| All webhooks `400` after a switch | Key and webhook secret from different modes or endpoints | Set the secret of the endpoint in the same mode |
| Webhooks `501` | A Stripe variable is empty | Set both; redeploy |
| `No such checkout.session` in logs | Orders from the other mode | Expected after a switch; resolve after restoring the correct mode |
| Test orders visible in production reports | Test Mode was used on production | Cancel their supplier orders; exclude `cs_test_` orders from reports |
| Checkout fails right after restoring live mode | Live key wrong, expired or missing a permission | Restore the previous key version; see Runbook §10.2 |

**Rollback of a mode change:** put back the previous pair of `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (always as a pair), redeploy, and run the verification in §5 step 9.

## 9. Safety rules

- Never let a URL parameter, cookie or unauthenticated user change the payment mode. The current code has no such path; keep it that way.
- Never expose secret keys in browser code (the codebase uses none).
- Never mix sandbox and live keys or webhook secrets.
- Never record test transactions as real revenue.
- Never trigger real fulfilment from simulated payments.
- Don't switch a shared production environment while customers are paying.
- Prefer separate staging and production environments.

References: https://docs.stripe.com/keys (sandbox vs live mode) · https://docs.stripe.com/sandboxes · https://docs.stripe.com/testing · https://docs.stripe.com/webhooks · https://docs.stripe.com/get-started/checklist/go-live
