# olozzo — dropshipping commerce platform for Europe

olozzo is a Shopify-style, multi-store dropshipping platform built with **Next.js 15**. Merchants open stores and
import products from verified EU suppliers. Customers buy in EUR with VAT included. Every paid order is split
per supplier and sent to them automatically, and suppliers ship straight to the customer with tracking.

```
 Supplier lists product ──► Merchant imports (with markup) ──► Customer buys in store
                                                                     │  Stripe / Mollie
                                                                     ▼
 Customer tracks parcel ◄── Supplier ships + adds tracking ◄── Order split per supplier
```

## Quick start

```bash
npm install
npm run setup        # creates the tables in DATABASE_URL (Postgres) and seeds demo data
npm run dev          # http://localhost:3000
```

All demo accounts use the password **`Demo1234!`**

| Role | Email | Lands on |
|---|---|---|
| Platform admin | `admin@olozzo.com` | `/admin` |
| Merchant (Urban Nest) | `merchant@olozzo.com` | `/merchant` |
| Merchant (Glow & Go) | `merchant2@olozzo.com` | `/merchant` |
| Supplier, DE electronics | `supplier@olozzo.com` | `/supplier` |
| Supplier, PT fashion/home | `supplier2@olozzo.com` | `/supplier` |
| Supplier, PL beauty/sport | `supplier3@olozzo.com` | `/supplier` |
| Supplier awaiting approval | `newsupplier@olozzo.com` | `/supplier` |
| Customer | `customer@olozzo.com` | `/account` |

Demo stores: `/s/urban-nest` and `/s/glow-and-go`. Try discount codes `WELCOME10`, `SAVE5` and `GLOW15`.

`npm run db:reset` wipes the database and re-seeds it.

## Features

### Storefronts (Shopify-style)
- One store per merchant at `/s/<store>`, with optional subdomains (`<store>.yourdomain.com`, see `NEXT_PUBLIC_ROOT_DOMAIN`)
- Brand colour, logo, banner and tagline per store
- Search, category filters and sorting
- Product pages with image gallery, variants (size/colour), stock levels, delivery estimate and ships-from country
- Cart stored per store in the browser; checkout re-prices everything on the server
- Order status page with a timeline and a tracking link for each parcel

### Payments
| Provider | Methods | Setup |
|---|---|---|
| **Stripe Checkout** | Cards, Apple/Google Pay, SEPA Direct Debit, iDEAL, Bancontact, Klarna, EPS, Przelewy24 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Mollie** | iDEAL, Bancontact, SOFORT, EPS, PayPal, cards | `MOLLIE_API_KEY` |
| **Demo** | Simulated payment for testing | `ENABLE_DEMO_PAYMENTS=true` |

- Webhooks: `POST /api/webhooks/stripe` and `POST /api/webhooks/mollie`
- Payment is also confirmed when the customer returns to the order page, so orders complete on localhost without webhooks
- Refunds go through the same provider, from the merchant's order page

### EU compliance
- Prices include VAT. VAT is calculated for the customer's country (OSS rules) for all 27 EU states (`src/lib/eu.ts`)
- 14-day withdrawal: customers request returns online; merchants approve, reject or refund
- GDPR: cookie consent banner, data export as JSON (Art. 15/20), account deletion (Art. 17), marketing opt-in
- Template legal pages: imprint, terms, privacy, withdrawal, cookies (`/legal/*`)
- Checkout button wording follows the German "Button-Lösung" rule ("order with obligation to pay")

### Role-based access control
Defined in [`src/lib/rbac.ts`](src/lib/rbac.ts). Each user has one role, and each role has a fixed set of permissions.

| | Admin | Merchant | Supplier | Customer |
|---|:-:|:-:|:-:|:-:|
| Manage users, roles, plans, categories | ✔ | | | |
| Approve suppliers, moderate products | ✔ | | | |
| Manage own store, import products, discounts | ✔ | ✔ | | |
| Store orders, refunds, returns | ✔ | ✔ | | |
| Wholesale catalog, CSV import | ✔ | | ✔ | |
| Fulfil orders, add tracking | ✔ | | ✔ | |
| Own orders, request returns | ✔ | ✔ | ✔ | ✔ |

Access is checked in three places:
1. **Middleware** checks the signed JWT before a route runs
2. **Server layouts** re-read the user from the database, so suspensions and role changes apply immediately
3. **Every server action** checks the permission and that the record belongs to the caller

An audit log records role changes, approvals, refunds, imports and more (`/admin/audit`).

### Dashboards
- **Admin:** sales volume and fee revenue, all orders, stores (plan, publish), supplier approval, product moderation, users (role, suspend), categories, permission matrix, audit log
- **Merchant:** revenue and true profit (after VAT, supplier cost and fees), setup checklist, supplier catalog with one-click import and profit estimate, product editor (price, compare-at price, featured), orders with profit per order, refunds, returns, discount codes, store settings, plans
- **Supplier:** fulfilment queue with pick list and ship-to address (blind dropshipping), accept, ship (carrier and tracking) and delivered actions, product editor with variants, CSV bulk import, low-stock alerts, company profile
- **Customer:** order history, tracking, return requests, profile, password, data export, account deletion

### Business model
Plans and transaction fees are in [`src/lib/plans.ts`](src/lib/plans.ts):

| Plan | Price | Fee per order |
|---|---|---|
| Starter | €29/month | 2% |
| Growth | €79/month | 1% |
| Pro | €299/month | 0.5% |

Merchant profit per order = (total − VAT) − supplier cost − supplier shipping − platform fee.

## Tech stack
- Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript
- Prisma ORM on Postgres (e.g. Neon)
- Tailwind CSS 3, lucide-react icons
- `jose` (JWT sessions), `bcryptjs` (passwords), `zod` (validation), `stripe`

```
prisma/schema.prisma      data model (users, stores, suppliers, products, variants, orders, fulfilments…)
prisma/seed.ts            demo data
src/middleware.ts         RBAC route guard + store subdomain rewrites
src/lib/                  auth, rbac, checkout pricing, order routing, payments, EU VAT
src/app/s/[slug]/         storefront (home, product, cart, checkout, order status)
src/app/admin|merchant|supplier|account/   role dashboards + their server actions
src/app/api/              checkout, quote, webhooks, GDPR export
```

The core dropshipping logic is `markOrderPaid()` in [`src/lib/orders.ts`](src/lib/orders.ts). It runs once per order,
even if several payment confirmations race. It creates one `SupplierOrder` per supplier, decrements stock and
counts discount use. `syncOrderStatus()` then moves the order from processing to shipped to delivered as
suppliers update their parcels.

## Going to production

1. **Database:** point `DATABASE_URL` at Postgres (Neon via the Vercel Marketplace, Supabase, RDS…),
   then run `npx prisma db push` (or `prisma migrate deploy`).
2. **Secrets:** set a long random `AUTH_SECRET`, and set `NEXT_PUBLIC_APP_URL` to your domain.
3. **Payments:** add your Stripe and/or Mollie live keys. In Stripe, create a webhook to
   `https://<domain>/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `checkout.session.expired`. Set `ENABLE_DEMO_PAYMENTS="false"`.
   Local Stripe testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
4. **Legal:** replace the template texts in `src/app/legal/[page]/page.tsx` with your company details and have them reviewed.
5. **Deploy:** Vercel, or any Node host with `npm run build && npm start`.

## Not included yet
These need third-party accounts or business decisions:
- **Payouts:** money currently lands in one platform Stripe/Mollie account. Split payouts to merchants and suppliers need Stripe Connect or Mollie Connect.
- **Transactional email** (order confirmation, shipping updates): add Resend, Postmark or SMTP where `audit()` is called in `src/lib/orders.ts`.
- **Image uploads:** products use image URLs; add S3, R2 or UploadThing for direct uploads.
- **Multi-language storefronts** (DE/FR/ES/IT/NL) and multi-currency (SEK, PLN, DKK…)
- **External supplier APIs** (e.g. BigBuy, CJ Dropshipping): the CSV import is the current bulk path
- Subscription billing for plans (Stripe Billing); plan changes are currently free switches
- Email verification and password reset
