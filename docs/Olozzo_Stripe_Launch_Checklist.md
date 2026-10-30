# Olozzo.com: Stripe Launch Checklist

For the **client** (Stripe account owner), the **project manager**, the **developer** and the **server administrator**. Each part must be completed and signed before live payments start. Technical details: [Live Deployment Guide](Olozzo_Stripe_Live_Deployment_Guide.md) · execution steps: [Production Runbook](Olozzo_Stripe_Production_Runbook.md) · client how-to: [Client Setup Guide](Olozzo_Stripe_Client_Setup_Guide.md).

**Current status (29 Oct 2026):** the Stripe integration works in Stripe's test environment (sandbox) on the developer's machine. **Live payments are not active.** Nothing on this list is complete until it is ticked and signed.

Never send passwords, bank login details, full bank account numbers, identity documents or API keys by email or chat. Bank and identity details are entered **only on stripe.com**; keys go **only** into the server's secret store.

---

## Part A: Client (Stripe account owner) · Gate G1

| ✓ | Task | How to confirm |
|---|---|---|
| ☐ | The Stripe account receiving Olozzo.com revenue is owned by the business, with two-step login enabled | Settings → your user profile |
| ☐ | The account is registered in the business's legal country (can't be changed later) | Settings → Business |
| ☐ | Business and identity verification complete | Dashboard shows no "activate" or "verify" prompts |
| ☐ | No restrictions: payments and payouts enabled | No warning banners on the Dashboard home |
| ☐ | Payout bank account added (in the business's name) and accepted | Settings → Money management |
| ☐ | Payout currency and schedule reviewed (Olozzo charges in EUR) | Settings → Money management |
| ☐ | Stripe fees reviewed | https://stripe.com/pricing |
| ☐ | Public details set: business name, support email and phone, statement descriptor | https://dashboard.stripe.com/settings/public |
| ☐ | Payment methods to offer chosen (e.g. cards, SEPA Direct Debit, Klarna, PayPal) | Tell the developer |
| ☐ | Dispute email notifications switched on; person responsible for disputes named: __________ | Your user settings → communication preferences (https://dashboard.stripe.com/settings/user) |
| ☐ | Email receipts to customers switched on (Olozzo doesn't yet send its own confirmations) | https://dashboard.stripe.com/settings/emails |
| ☐ | Developer invited as a **team member** with limited access (no shared password) | https://dashboard.stripe.com/settings/team |
| ☐ | Legal pages (imprint, terms, privacy, withdrawal) contain real company details and have been reviewed | Website `/legal/*` |

Client signature: ______________________  Date: ________

## Part B: Developer

| ✓ | Task | Reference |
|---|---|---|
| ☐ | Stripe work committed, reviewed, merged and tagged (`<RELEASE_TAG>`) | Runbook §1 (blocker B1) |
| ☐ | Type check, tests and production build pass; no secrets in build output | Runbook §1 |
| ☐ | Restricted live key permissions tested in staging / sandbox | Deployment Guide §4.1 |
| ☐ | No demo accounts with the default password in production | Runbook 1.9 (blocker B6) |
| ☐ | Live restricted key created in the client's account and stored only in the secret store | Runbook §4.1 |
| ☐ | Live webhook endpoint created (eight events, snapshot, API version `2026-09-30.endive`) and its secret stored | Runbook §4.2 |
| ☐ | Schema change previewed (no `DROP`) and applied after backup | Runbook §3.4 |
| ☐ | Post-deployment checks passed: HTTPS, webhook probe `400`, admin page shows **live mode** | Runbook §6 |
| ☐ | Rollback target recorded: `<PREVIOUS_RELEASE_TAG>` / previous deployment | Runbook §10 |

Developer signature: ______________________  Date: ________

## Part C: Server administrator / DevOps · Gate G2

| ✓ | Task |
|---|---|
| ☐ | Hosting provider and deployment method confirmed: ______________________ |
| ☐ | Production domain confirmed (www or not): `https://______________________` |
| ☐ | Valid HTTPS certificate; the webhook URL answers without redirect |
| ☐ | Secret storage method confirmed; access limited to: ______________________ |
| ☐ | Node.js 20 or newer on the build and runtime platform |
| ☐ | Database backup taken and restore tested before the schema change |
| ☐ | Restart, status and log commands documented (self-managed server only) |
| ☐ | Outbound access to `api.stripe.com` and inbound HTTPS from Stripe allowed |
| ☐ | Previous release kept for rollback |

DevOps signature: ______________________  Date: ________

## Part D: Management approvals · Gates G3, G4, G5

| ✓ | Approval | Approved by | Date |
|---|---|---|---|
| ☐ | **G3:** Create and store live Stripe credentials for Olozzo.com | Client | |
| ☐ | **G4:** Deployment window: date ________ time ________ (low traffic). Rollback owner: ________ | PM + Client | |
| ☐ | **G5:** One controlled real payment. Product ________ · amount € ________ · card owner ________ · refund by ________ · supplier warned ☐ | Client | |
| ☐ | Refund policy: who may refund, and up to what amount | Client | |
| ☐ | Open risks accepted: disputes only logged in the app (R1), no automatic alerts (R4), no order emails from Olozzo (R3) | Client + PM | |

## Part E: Go-live verification and sign-off · Gate G6

**Real-payment test result** (Runbook §7):

| ✓ | Check | Result |
|---|---|---|
| ☐ | Test payment shown in Stripe **Payments** (live) | Order no. ________ |
| ☐ | Order shown as **Paid** on the Olozzo admin pages | |
| ☐ | Webhook delivery succeeded (status 200) | |
| ☐ | Refund completed; order shown as **Refunded** | Refund € ________ |
| ☐ | Supplier order cancelled; nothing shipped | |

**Payout verification** (client; may take days after launch):

| ✓ | Check |
|---|---|
| ☐ | **Balances** shows the payments (pending, then available) |
| ☐ | First payout appears under **Payouts** with an expected arrival date. Stripe states the first payout typically arrives 7–14 days after the first live payment; this depends on country and risk and isn't guaranteed |
| ☐ | First payout received in the business bank account (date: ________) |

A customer's successful payment doesn't mean the money is already in the bank. Stripe deducts its fees and pays out available funds on the payout schedule.

**First two weeks:** daily check of webhook failures and server errors (developer), disputes (client), and `/admin/payments` (developer); weekly payout check (client).

### Final launch sign-off

| | Name | Signature | Date |
|---|---|---|---|
| Client (Stripe account owner) | | | |
| Project manager | | | |
| Developer | | | |
| Server administrator | | | |

Unresolved risks at launch (PM to record):

1. ____________________________________________
2. ____________________________________________
