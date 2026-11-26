# Connecting CJdropshipping to Olozzo — From Scratch

A plain-language, start-to-finish guide: create a CJdropshipping account, get your API credentials, and connect them to Olozzo. No coding knowledge needed for Parts 1–2. Part 3 (the one-time technical setup) can be handed to your developer.

**Time needed:** ~20 minutes, plus CJ account verification.
**You'll end up with:** a connected CJ account, ready to browse and import products inside Olozzo Admin → CJdropshipping.

---

## Overview — what you're connecting and why

CJdropshipping supplies and ships the products. Olozzo is your shop. "Connecting the API" means giving Olozzo a secure key so it can, on your behalf:
- read CJ's product catalogue (to import products into your shop),
- send CJ the orders your customers pay for,
- pull back tracking numbers.

You connect once. After that, everything happens inside the Olozzo admin panel.

```
  CJdropshipping  ──(products)──▶  Olozzo shop  ──(customer buys, pays via Stripe)
        ▲                                                      │
        └──────────────── (order + address) ◀─────────────────┘
                     (then CJ ships, tracking flows back)
```

---

## Part 1 — Create your CJdropshipping account

1. Go to **https://cjdropshipping.com** and click **Sign Up** (top-right).
2. Register with your **business email** and a strong password. *(Use an email you control long-term — it becomes part of your API login.)*
3. Open the verification email from CJ and click the link to confirm your address.
4. Sign in. Complete the basic profile prompts (store name, country, how you sell). You can skip optional marketing questions.
5. You now have a CJ account. **Keep the login email handy** — you'll need it in Part 2.

> There is no charge to open an account or to use the API. You only pay for products and shipping, later, from a prepaid **CJ wallet** (covered in Part 4).

---

## Part 2 — Get your API credentials

CJ gives you an **API Key**. Together with your **login email**, that's everything Olozzo needs.

1. Signed in to CJ, open your account menu (your name / avatar, top-right).
2. Look for **"API"** — it's usually under one of:
   - **Account → API**, or
   - **My CJ → Authorization**, or
   - a **Developer / Open Platform** section.
   *(CJ occasionally moves this. If you can't find it, search the CJ Help Center for "API Key" or ask CJ support "where do I generate my API key?")*
3. On the API page, click **Generate** (or **Get API Key** / **Create**).
4. **Copy the API Key** and paste it somewhere safe for a moment (a password manager is ideal).
5. Write down the two things you now have:
   - **CJ login email:** `________________________`
   - **CJ API Key:** `________________________`

> ⚠️ Treat the API Key like a password. Anyone with it can act on your CJ account. Never post it in chat, email, or screenshots. If it ever leaks, return to this page and **regenerate** it (the old one stops working).

---

## Part 3 — Connect the key to Olozzo *(one-time technical step)*

Hand this part to whoever manages the Olozzo site, or follow it if that's you. It's done once.

**3a. Add the credentials to the environment**

In the Olozzo project's environment settings add these two values (and for the live site, add them in your hosting dashboard, e.g. Vercel → Settings → Environment Variables):

```env
CJ_EMAIL="your-cj-login-email"
CJ_API_KEY="your-cj-api-key"
```

Then restart the app (locally) or redeploy (production) so it picks them up.

**3b. Prepare the database (first time only)**

```bash
npx prisma db push --accept-data-loss
```

This creates the CJ-related tables. It's safe — nothing existing is removed.

**3c. Test the connection**

1. Sign in to Olozzo as an **admin**.
2. Open **Admin → CJdropshipping** (`/admin/cj`).
3. Confirm the **Credentials** badge says *"CJ_API_KEY set"*.
4. Click **Test connection**.
   - ✅ *"Connected to CJdropshipping."* — you're done with setup.
   - ❌ If it fails, read the message (also logged on the page under *Recent CJ activity*) and see Troubleshooting below.

---

## Part 4 — Before you sell: fund the wallet

Importing and browsing are free. But when a real customer order is forwarded to CJ, CJ creates the order as **unpaid** and expects payment from your **prepaid CJ wallet** — not your card automatically.

1. In the CJ dashboard open your **Wallet / Balance**.
2. **Top it up** with enough to cover expected product + shipping costs.
3. ⚠️ **Important:** ask CJ support whether orders can be **paid automatically via the API**, or must be **paid by hand in the CJ dashboard**. Olozzo creates the CJ order automatically and flags it as awaiting wallet payment; the payment click may still be manual until CJ confirms automation. Your developer can switch on auto-pay once CJ confirms it's supported.

---

## Part 5 — You're connected. What now?

Inside **Admin → CJdropshipping**:
- **Browse** CJ's catalogue, search, and **Import** products with one click — they appear in your shop with your markup applied automatically.
- Imported products are managed like any other Olozzo product (edit price, title, images, visibility).
- Once background jobs are scheduled (your developer sets this up), paid orders are forwarded to CJ and tracking is pulled back for you.

---

## Troubleshooting the connection

| What you see | What to do |
|---|---|
| Badge shows **"Not configured"** | The email/key weren't added, or the app wasn't restarted after adding them (Part 3a). |
| **Test connection** fails with an auth error | Double-check the email and key for typos; confirm API access is enabled on your CJ account. Regenerate the key if unsure. |
| Fails with a rate-limit / "too many requests" error | Wait about a minute and try again — CJ limits how often you can request a token. |
| The **Admin → CJdropshipping** page errors when opened | The database step (Part 3b) hasn't been run yet. |
| Can't find the API page in CJ | It moves between dashboard versions — search CJ Help for "API Key" or ask CJ support directly. |

## Your connection checklist

- [ ] CJ account created and email verified
- [ ] API Key generated and stored safely
- [ ] CJ login email + API Key recorded
- [ ] `CJ_EMAIL` and `CJ_API_KEY` added to Olozzo's environment (Part 3a)
- [ ] `npx prisma db push --accept-data-loss` run once (Part 3b)
- [ ] **Test connection** shows *Connected* (Part 3c)
- [ ] CJ wallet funded; payment method (API vs manual) confirmed with CJ (Part 4)

---

*Related: [Olozzo_CJdropshipping_Setup_Guide.md](./Olozzo_CJdropshipping_Setup_Guide.md) (full technical setup incl. background jobs) · [CJdropshipping_Integration_Plan.md](./CJdropshipping_Integration_Plan.md) (architecture).*
