# Olozzo.com: Stripe Setup Guide for the Business Owner

This guide explains, in plain language, what you, the owner of Olozzo.com, need to do so that customers' payments reach your bank account. Your developer handles the website side; the steps below are the ones only you can do.

> **Important:** never send passwords, bank login details, full bank account numbers or identity documents to your developer or anyone else. You enter these **directly on Stripe's website**, and only on pages whose address starts with `https://` and ends in **stripe.com**. Stripe staff will never ask for your password.

---

## 1. Create your Stripe account or log in

Stripe is the company that processes card and bank payments for Olozzo.com. Customers pay on a secure Stripe page; Stripe then sends the money to your bank account.

1. Go to **https://stripe.com/** and click **Sign in**. If you don't have an account yet, click **Start now** to register.
2. Use an email address that belongs to the business and that you will keep long-term.
3. Turn on **two-step verification** (a passkey, security key or authenticator app) under your user settings. This protects the account that receives your revenue.

**The account must belong to your business.** The developer currently tests with a separate test account. Your real payments must go to an account that **you** own and control.

**Choose the right country.** Pick the country where your business is **legally registered**. Stripe's requirements, fees and payout options depend on this country, and **it can't be changed after the account is activated**. You would have to open a new account.

## 2. Verify your business ("activate payments")

Before Stripe lets you accept real money, it must check who you are. Banking laws require this; it's called "Know Your Customer".

In the Stripe Dashboard, follow the prompt to **activate payments** or **verify your business** (https://dashboard.stripe.com/account/onboarding). Stripe typically asks for:

| Topic | Examples |
|---|---|
| Business type | Sole trader, company, partnership, non-profit (options vary by country) |
| Legal business details | Registered name, registration or tax number, registered address |
| Representative | The person opening the account: name, date of birth, address, sometimes ID |
| Owners and directors | People who own or control the business, if your country requires it |
| What you sell | A short description of Olozzo.com's products |
| Website | `https://<PRODUCTION_DOMAIN>` (the live Olozzo.com address) |
| Public details | Name shown to customers, support email and phone, statement descriptor (the text on customers' card statements) |
| Bank account | For payouts (see section 4) |

The exact questions **depend on your country and business type**, so follow what the Dashboard asks for.

**Documents:** Stripe may ask for an ID document or business papers, sometimes weeks after you start, for example when sales grow. You'll see the request as a banner in the Dashboard and in an email from a `stripe.com` address. Upload the documents **directly in the Dashboard**.

**Restrictions:** if Stripe needs more information, it may pause payments or payouts until you provide it. Check the Dashboard home page for notices and resolve them promptly.

**How you know you're ready:** the Dashboard no longer asks you to activate. Payments and payouts show as enabled, and there are no outstanding requirements.

## 3. Website requirements

Stripe reviews your website. Before launch, make sure Olozzo.com shows:

- What you sell, with clear prices in euros (VAT included)
- Contact details: email address, phone if available, business address
- Terms and conditions, a privacy policy, the right of withdrawal (14 days in the EU), and refund and return rules
- Delivery information

Olozzo.com has template legal pages at `/legal/…`. **They must be replaced with your real company details and reviewed by a legal adviser before launch.** Your developer can tell you where they are.

## 4. Add your bank account for payouts

1. In the Dashboard, open **Settings → Money management** (payout settings): https://dashboard.stripe.com/settings/money-management
2. Click to add, or **Edit**, your bank account.
3. Enter the account holder name and the bank details your country uses (in most of Europe, the **IBAN**).
4. The account should be in the business's name and in the currency you want to be paid in.
5. Stripe may check the account; follow any instructions on screen.

**How to confirm it's ready:** the bank account appears in payout settings without a warning, and the Dashboard shows no payout notices.

**Currency:** Olozzo.com charges customers in **euros (EUR)**. If your bank account or payout currency is not EUR, Stripe converts the money, and conversion costs apply. Ask your developer or Stripe support if you're unsure.

## 5. Payout schedule, fees and timing

**How money reaches you:**

```
Customer pays on Olozzo.com
   → Stripe processes the payment
   → Your Stripe balance shows the payment, minus Stripe's fee
   → After a short holding period, the money becomes "available"
   → Stripe sends available money to your bank (your payout schedule)
   → The money arrives in your bank account
```

- **First payout:** usually **7–14 days** after your first real payment. Stripe holds the first funds a little longer while the account is new.
- **Later payouts:** follow your **payout schedule** (daily, weekly, monthly or manual, depending on your country). Change it in payout settings.
- **Bank transfers such as SEPA Direct Debit** take several business days longer than card payments to become available.
- **Fees:** Stripe deducts its processing fee from each payment. See https://stripe.com/pricing for your country. Currency conversion and some payment methods cost extra.
- **Refunds:** when you refund a customer, the amount comes back out of your Stripe balance. If the balance is too low, Stripe may take it from your bank account.
- **Disputes (chargebacks):** if a customer disputes a payment with their bank, Stripe holds the amount plus a dispute fee, and you have a limited time to respond with evidence. See https://docs.stripe.com/disputes.

No one can promise exact amounts or arrival dates. They depend on Stripe, your country, the payment method and your bank.

**Where to check your money:**

| Question | Where in the Dashboard |
|---|---|
| How much is waiting? | **Balances** |
| Did a customer pay? | **Payments** |
| When is the next payout? Did it arrive? | **Payouts** (statuses: pending → in transit → paid; or failed) |

**If a payout is delayed or fails:** check payout settings for a warning, confirm the bank details and currency, and check whether Stripe is asking for information. Then contact Stripe support from the Dashboard. A failed payout returns to your Stripe balance and is retried after you fix the problem.

## 6. Information to have ready

- Legal business name, registration number, VAT/tax number, registered address
- Personal details of the representative (and owners or directors if asked)
- Business bank account details (IBAN or local equivalent), entered by you in Stripe
- Public support email and phone number
- Statement descriptor, for example `OLOZZO`, so customers recognise the charge
- The live website address

## 7. What your developer needs from you

| Item | How to give it |
|---|---|
| Access to your Stripe account | **Invite the developer as a team member** (Settings → Team) with the **Developer** role, or the most limited role that lets them manage API keys and webhooks. **Do not share your login.** |
| Live API key | The developer creates or reveals it themselves through their team access and stores it on the server. You never need to copy keys |
| Payment methods to offer | Tell the developer which methods you want (cards, SEPA Direct Debit, Klarna, PayPal …); they are switched on in Stripe's settings |
| Go-live date and approval | Written approval to switch the website to live payments |
| Approval for one real test payment | Written approval for a small real purchase that is then refunded |
| Refund and dispute policy | Who approves refunds, and who responds to disputes |

You remove the developer's access when the work is finished (Settings → Team).

## 8. What happens before launch

1. You finish verification and add your bank account (sections 1–4).
2. The developer prepares the live website and connects it to **your** Stripe account.
3. The developer checks that everything shows **live mode**.
4. With your written approval, someone makes **one small real purchase** and then refunds it. This proves money flows correctly. Stripe's fee on that test payment may not be returned.
5. The website opens for real customers. You and the developer watch the first orders and the first payout together.

**Test mode vs live mode:** during development, the developer uses Stripe's **sandbox (test mode)**. Sandbox payments are pretend payments: no money moves and nothing reaches your bank. In the Dashboard you can switch between sandbox and live views, but **switching the view doesn't change the website**. Only the developer's configuration does.

## 9. How you receive payments day to day

- Each customer order appears in Stripe under **Payments**, and on the Olozzo.com admin pages under **Orders**.
- Stripe sends payouts to your bank on your schedule; check them under **Payouts**.
- Customers see your statement descriptor on their card statement.
- Olozzo.com does not yet send its own order-confirmation emails. You can switch on **Stripe's email receipts** (Settings → Emails) so customers get a receipt.
- **Paying suppliers is not automatic.** All customer payments go into your one Stripe account; suppliers are paid separately, outside Stripe.

## 10. Client sign-off checklist

| ✓ | Item |
|---|---|
| ☐ | I own the Stripe account and have two-step verification switched on |
| ☐ | The account is registered in the correct country for my business |
| ☐ | Business verification is complete; the Dashboard shows no outstanding requirements |
| ☐ | My business bank account is added for payouts, and I've reviewed the payout currency and schedule |
| ☐ | Public business details, support email and statement descriptor are correct |
| ☐ | Legal pages (terms, privacy, withdrawal, imprint) contain my real details and have been reviewed |
| ☐ | I've invited the developer as a limited team member (no shared password) |
| ☐ | I've chosen the payment methods to offer |
| ☐ | I approve the go-live date: ____________ |
| ☐ | I approve one controlled real test payment and its refund |
| ☐ | I've agreed who handles refunds and disputes |

Signed: ______________________  Date: ____________

---

Official Stripe help: account activation https://docs.stripe.com/get-started/account/activate · payouts https://docs.stripe.com/payouts · pricing https://stripe.com/pricing · disputes https://docs.stripe.com/disputes · team members https://docs.stripe.com/get-started/account/teams
