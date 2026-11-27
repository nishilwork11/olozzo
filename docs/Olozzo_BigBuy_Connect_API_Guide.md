# Connecting BigBuy to Olozzo — From Scratch

A plain-language, start-to-finish guide: create a BigBuy account, get your API key, and connect it to Olozzo. No coding knowledge needed for Parts 1–2. Part 3 (the one-time technical setup) can be handed to your developer.

**Time needed:** ~20 minutes, plus BigBuy account + pack approval.
**You'll end up with:** a connected BigBuy account, ready to cache its catalogue and import products inside Olozzo Admin → BigBuy.

---

## Overview — what you're connecting and why

BigBuy supplies and ships the products (from Spain, across the EU). Olozzo is your shop. "Connecting the API" means giving Olozzo a secure key so it can, on your behalf:
- read BigBuy's product catalogue (to import products into your shop),
- send BigBuy the orders your customers pay for,
- pull back order status and tracking numbers.

You connect once. After that, everything happens inside the Olozzo admin panel.

```
     BigBuy  ──(products)──▶  Olozzo shop  ──(customer buys, pays via Stripe)
       ▲                                                   │
       └──────────────── (order + address) ◀───────────────┘
                    (then BigBuy ships, tracking flows back)
```

---

## Part 1 — Create your BigBuy account (with an API pack) ⚠️

1. Go to **https://www.bigbuy.eu** and register as a **distributor** (business account), using an email you control long-term.
2. Confirm your email and sign in to the **control panel**.
3. **Activate a pack that includes the API.** This is essential and often missed:
   - The **Ecommerce** or **Marketplace** pack **includes** API access.
   - The **B2B / Wholesaler** pack does **not** — an API key under it will be rejected with *"Invalid Token"*.
   - Open **My Account → Wholesaler Pack** and **Activate pack**, choosing an API-capable one. If unsure, ask BigBuy sales: *"Which pack gives me working API access?"*

> Opening the account is free, but the API requires a **paid pack** (a monthly fee plus a one-time registration fee). You pay for products and shipping later, from a prepaid **BigBuy balance** (Part 4). Confirm the current pack price on BigBuy's site before committing.

---

## Part 2 — Get your API key

BigBuy gives you an **API Key** (production). That single key is everything Olozzo needs — it's sent as a bearer token.

1. In the control panel open **My Account → Synchronise with BigBuy**.
2. Find the **API KEY** section. Click the **eye** icon to reveal **API Key Production**, then the **copy** icon.
3. Write down what you have:
   - **BigBuy API Key (Production):** `________________________`
4. *(Optional)* A **sandbox** key may be shown or requested via BigBuy's contact form — but the sandbox is for testing the order flow only and has no catalogue, so day-to-day use is the production key.

> ⚠️ Treat the API Key like a password. Anyone with it can act on your BigBuy account. Never post it in chat, email, or screenshots. If it ever leaks, use the **regenerate** icon on the same page (the old one stops working — update it everywhere).

---

## Part 3 — Connect the key to Olozzo *(one-time technical step)*

Hand this part to whoever manages the Olozzo site, or follow it if that's you. It's done once.

**3a. Add the credential to the environment**

In the Olozzo project's environment settings add these values (and for the live site, add them in your hosting dashboard, e.g. Vercel → Settings → Environment Variables):

```env
BIGBUY_API_KEY="your-bigbuy-api-key"
BIGBUY_SANDBOX="false"
```

Then restart the app (locally) or redeploy (production) so it picks them up.

**3b. Prepare the database (first time only)**

```bash
npx prisma db push --accept-data-loss
```

This creates the BigBuy-related tables. It's safe — nothing existing is removed.

**3c. Test the connection**

1. Sign in to Olozzo as an **admin**.
2. Open **Admin → BigBuy** (`/admin/bigbuy`).
3. Confirm the **Credentials** badge says *"BIGBUY_API_KEY set"* and **Environment** says *Production*.
4. Click **Test connection**.
   - ✅ *"Connected to BigBuy (production)."* — you're done with setup.
   - ❌ *"Invalid Token"* — your account doesn't have an API-capable pack yet (Part 1), or the wrong key was copied.
   - ❌ *"Could not reach BigBuy at api.sandbox.bigbuy.eu…"* — you're still in sandbox mode; set `BIGBUY_SANDBOX="false"` and restart.

---

## Part 4 — Before you sell: fund the balance

Caching the catalogue, browsing and importing are free. But when a real customer order is forwarded to BigBuy, BigBuy expects payment from your **prepaid balance** — not your card automatically.

1. In the BigBuy control panel open your **Wallet / balance**.
2. **Top it up** with enough to cover expected product + shipping costs.
3. ⚠️ **Important:** confirm with BigBuy whether orders can be **funded automatically via the API**, or must be **confirmed by hand** in the dashboard. Olozzo creates the BigBuy order automatically and flags it as awaiting funding; the final payment may still be manual until BigBuy confirms automation.

---

## Part 5 — You're connected. What now?

Inside **Admin → BigBuy**:
- **Pull** a first-level taxonomy to cache part of BigBuy's catalogue (BigBuy has no live search), then **Browse** and **Import** products with one click — they appear in your shop with your markup applied automatically.
- Imported products are managed like any other Olozzo product (edit price, title, images, visibility).
- Once background jobs are scheduled (your developer sets this up), paid orders are forwarded to BigBuy and status/tracking is pulled back for you.

---

## Troubleshooting the connection

| What you see | What to do |
|---|---|
| **Test connection** fails with **"Invalid Token"** | Your account has no API-capable pack — activate the **Ecommerce/Marketplace** pack (Part 1). The B2B/Wholesaler pack does not include API. Double-check you copied the right key. |
| **"Could not reach BigBuy at api.sandbox.bigbuy.eu…"** | You're in sandbox mode; the sandbox has no catalogue and is often unreachable. Set `BIGBUY_SANDBOX="false"` and restart (Part 3a). |
| Badge shows **"Not configured"** | The key wasn't added, or the app wasn't restarted after adding it (Part 3a). |
| The **Admin → BigBuy** page errors when opened | The database step (Part 3b) hasn't been run yet. |
| Browse shows **"No cached products"** | Pull a first-level taxonomy into the cache first (Part 5). |

## Your connection checklist

- [ ] BigBuy account created and email verified
- [ ] **API-capable pack activated** (Ecommerce/Marketplace) ⚠️
- [ ] Production API Key copied and stored safely
- [ ] `BIGBUY_API_KEY` added to Olozzo's environment, `BIGBUY_SANDBOX="false"` (Part 3a)
- [ ] `npx prisma db push --accept-data-loss` run once (Part 3b)
- [ ] **Test connection** shows *Connected* (Part 3c)
- [ ] BigBuy balance funded; funding method (API vs manual) confirmed (Part 4)

---

*Related: [Olozzo_BigBuy_Setup_Guide.md](./Olozzo_BigBuy_Setup_Guide.md) (full technical setup incl. catalogue cache & background jobs).*
