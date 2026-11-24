# ReWear

**Clear your wardrobe. Earn from every KG.**

ReWear is a clothing buyback and sustainable-fashion commerce platform. Customers sell clothes by the kilogram with **free doorstep pickup**, watch them being weighed, approve the valuation and get paid **directly to UPI**. Every garment then gets a second life through premium resale, bulk B2B sales, recycling partners or NGO donations.

One Next.js PWA, one PostgreSQL database, eight role-based applications:

| Role | App | What they do |
|---|---|---|
| Customer | `/app` | Sell (KG / premium / recycling / donation), book free pickup, approve valuations, UPI payouts, receipts, rewards, shop pre-loved |
| Pickup Executive | `/collector` | Daily route & KPIs, navigation, booking-code verification, digital weighing, scale photos, doorstep approval, completion |
| Warehouse Manager | `/warehouse` | Receiving, sorting & grading, QR-labelled inventory, transfers, adjustment approval, re-inspection, resale listings, dispatch |
| Admin / Super Admin | `/admin` | KPIs & charts, bookings & assignment, pricing engine (maker–checker), operations, payouts & reconciliation, B2B, partners, finance ledger, reports, settings, audit log |
| B2B Buyer | `/business` | Verified business catalogue, purchase requests, negotiation, invoices, tracking |
| Recycler Partner | `/recycler` | Dispatches, received-weight confirmation, settlements |
| Donation Partner (NGO) | `/partner` | Incoming donations, acknowledgement notes |

Public website: `/`, `/how-it-works`, `/pricing`, `/guidelines`, `/sustainability`, `/b2b`, `/shop`, `/about`, `/contact`, `/faq`, `/terms`, `/privacy`, `/install`.

---

## Quick start (development)

Requirements: **Node 20+** and **PostgreSQL 15+** (local install or Docker).

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET
```

Start a database — either option works:

```bash
npm run db:local              # isolated cluster in ./.data/postgres on port 5433 (uses installed PostgreSQL binaries)
```

```bash
docker compose up -d db       # or: Docker, also on port 5433
```

Then:

```bash
npx prisma migrate deploy     # apply migrations (incl. DB-level business constraints)
npm run db:seed               # realistic demo data — WIPES the target database
npm run dev                   # http://localhost:3000
```

### Demo accounts

In development (`DEMO_OTP_ENABLED=true`, never in production) every seeded number signs in with OTP **123456**:

| Role | Mobile |
|---|---|
| Customer (has a valuation awaiting approval) | 9000000001 |
| Customer (no UPI yet) | 9000000002 |
| Pickup Executive (today's route) | 9000000003 |
| Warehouse Manager | 9000000004 (second approver: 9000000014) |
| Admin | 9000000005 |
| Super Admin | 9000000006 |
| B2B Buyer (verified) | 9000000007 |
| Recycler Partner | 9000000008 |
| Donation Partner (NGO) | 9000000009 |

Any other number receives a real OTP via the configured provider (in development the code is printed to the server console).

### Walk the core flow

1. Customer `9000000001` → **Sell clothes** → choose categories, weight, see the server estimate → book a free slot. Note the 4-digit doorstep code.
2. Collector `9000000003` → open the pickup → **Start trip** → enter the doorstep code → enter gross/tare/category weights + scale photo.
3. Customer approves the valuation in the app (or reads the 6-digit SMS code to the collector — it's printed in the server console in dev).
4. Collector → **Complete pickup** → payout is created; ≤ ₹1,500 auto-approves and is sent to the sandbox provider.
5. Admin `9000000005` → **Payouts → Reconcile with provider** → payout becomes *Successful* with a UTR; the customer can download the receipt.
6. Warehouse `9000000004` → **Receiving** → **Batches** → sort into grades → inventory, resale listings, B2B and recycler dispatch.

---

## Architecture

```
src/
  app/                    Next.js App Router — one route group per role app
    (site)/               public website + shop
    (auth)/               login (phone OTP, Google) & onboarding
    app/ collector/ warehouse/ admin/ business/ recycler/ partner/
    actions/              server actions (thin: auth → zod → service)
    api/                  route handlers: uploads, files, quote, slots, webhooks, cron, exports
    receipts/             printable payout receipts, donation receipts, tax invoices
  server/
    domain/               pure business rules (pricing selection, valuation maths, weighing,
                          state machines, free-pickup policy) — no I/O, fully unit-tested
    services/             transactional business services shared by every app
    providers/            payout (sandbox | RazorpayX), payment (sandbox | Razorpay),
                          SMS/WhatsApp/email, storage (local | Supabase)
    auth/                 sessions, OTP, RBAC matrix, guards
  components/             design system (shadcn-style), charts, PWA, role UI
prisma/                   schema, migrations, seed
tests/unit, tests/integration
```

Key design decisions:

- **Money in integer paise, weight in integer grams.** No floating-point money anywhere.
- **Server-side pricing only.** The client never sends a rate or amount; `/api/pricing/quote` and `createBooking` compute from approved rules. Each booking stores a **pricing snapshot**; later price changes never touch existing bookings.
- **Free pickup is not configurable.** `PICKUP_FEE_PAISE = 0` in code, a `CHECK ("pickupFeePaise" = 0)` constraint in the database, a settings guard that rejects any fee key, and a deduction guard that rejects pickup/convenience/logistics charges. Minimum quantities can only be introduced as a published per-area policy with a customer-facing note.
- **Valuation versions.** Every weighing creates a `Valuation` version; approval records timestamp, method (app / doorstep OTP) and version. Warehouse re-inspection issues a new version the customer must approve; rejection routes to dispute or return (configurable).
- **Direct UPI payouts, no wallet.** One payout per booking (unique), conditional state transitions with optimistic locking, one provider attempt per idempotency key, retries only from FAILED/REVERSED, unknown outcomes resolved by reconciliation that re-sends the *same* key, and `SUCCESSFUL` only from provider confirmation (verified webhook or status fetch).
- **Double-entry ledger.** Payout accruals/settlements/reversals, marketplace captures, refunds, B2B and recycler revenue, operating costs — each journal is balanced and idempotent by key.
- **Inventory integrity.** One batch per booking (unique), every change is an `InventoryMovement`, adjustments need a second manager, stock can't go negative (DB checks), weight is traceable collected → received → sorted → dispatched.
- **RBAC.** A permission matrix (`src/server/auth/permissions.ts`) is enforced inside every service, not just in the UI; it's mirrored into Role/Permission tables and visible in Settings → Permissions. Collectors can never change rates or payout values.
- **Audit log** for every sensitive mutation, with before/after snapshots.

## Integrations

All integrations sit behind provider interfaces and default to safe local implementations:

| Concern | Development | Production |
|---|---|---|
| OTP / SMS | console | MSG91 or Twilio |
| WhatsApp | console | Meta WhatsApp Cloud API |
| Email | console | Resend |
| UPI payouts | sandbox simulator (VPA containing `fail` fails, `reverse` reverses) | RazorpayX Payouts (`X-Payout-Idempotency`) |
| Marketplace payments | sandbox gateway page | Razorpay Checkout + signature verification + webhook |
| File storage | private `./.data/uploads`, served via authenticated route | Supabase Storage (private bucket) |
| Maps | Google Maps deep links for navigation | + optional Maps JS key |

Webhooks: `POST /api/webhooks/payouts` (HMAC-SHA256 of raw body, `x-razorpay-signature`), `POST /api/webhooks/payments`. Both deduplicate on event id.

Scheduled job: `GET /api/cron/reconcile` with `Authorization: Bearer $CRON_SECRET` — reconciles in-flight payouts and releases expired cart reservations. Run every 5 minutes (Vercel Cron, GitHub Actions, or system cron).

## Security

Role-based access control in services · HTTP-only, SameSite session cookies with server-side revocation · OTP codes HMAC-hashed, single-use, attempt-limited · Postgres-backed rate limiting (OTP, uploads, contact, exports) · Zod validation on every action and route · magic-byte image validation and private storage · verified, deduplicated webhooks · idempotent payouts and ledger · CSV formula-injection protection · security headers (HSTS, frame denial, nosniff) · no UPI PINs or payment credentials are ever collected · `AUTH_SECRET` and provider secrets only in environment variables; production refuses the dev secret · personal-data export and account deletion for customers.

**Backups:** use your Postgres host's point-in-time recovery (Neon, Supabase, RDS, Cloud SQL), plus a nightly logical dump:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="rewear-$(date +%F).dump"
```

Keep 30 daily + 12 monthly copies in a separate account/region and test a restore quarterly (`pg_restore --clean --dbname=...`).

## Testing

```bash
npm test                      # unit + integration
```

```bash
npm run test:unit             # pure domain rules, no database
```

```bash
npm run test:integration      # real services against TEST_DATABASE_URL
```

Integration tests run against `TEST_DATABASE_URL` (migrated automatically, truncated per test; refuses to run if it equals `DATABASE_URL`). Coverage includes authentication (OTP hashing, single use, lockout, rate limits), booking creation, free-pickup enforcement (service, settings and DB constraint), pricing calculations and snapshots, maker–checker pricing approval, collector assignment and capacity, weight reconciliation, customer approval (app and doorstep OTP) and disputes, UPI payout idempotency/retries/concurrency, reconciliation, webhook signature verification and dedupe, ledger balance, inventory receiving/sorting/transfers/adjustment approval, re-inspection revaluation, B2B verification/MOQ/reservation/dispatch, and role permissions.

```bash
npm run typecheck
```

## Deployment

1. Provision PostgreSQL (Neon / Supabase / RDS) and a private Supabase Storage bucket.
2. Set production environment variables (see `.env.example`): a fresh `AUTH_SECRET`, `DEMO_OTP_ENABLED=false`, real OTP/WhatsApp/email providers, RazorpayX + Razorpay keys and webhook secrets, `STORAGE_DRIVER=supabase`, `APP_URL`.
3. Build & migrate:

```bash
npm ci && npx prisma migrate deploy && npm run build
```

4. Start with `npm start` (Node server), or deploy to Vercel / any Node host. Serve over HTTPS (required for PWA install and secure cookies).
5. Configure webhooks in RazorpayX (`payout.processed`, `payout.reversed`, `payout.failed`, `payout.updated` → `/api/webhooks/payouts`) and Razorpay (`payment.captured` → `/api/webhooks/payments`).
6. Schedule `/api/cron/reconcile` every 5 minutes.
7. Do **not** run the seed in production (it refuses unless forced).

### GitHub Pages preview (public site only)

GitHub Pages serves static files only, so it cannot run ReWear itself (no database, sign-in, bookings, payouts or role portals). It hosts a read-only snapshot of the public website instead: https://raiden-56.github.io/re-wear/

To refresh it, with the local database running and seeded:

```bash
PREVIEW_BASE_PATH=/re-wear npm run preview:static
```

This builds into `.next-preview/`, renders the public pages and shop items into `out/` with a "static preview" banner, then you publish `out/` to the `gh-pages` branch. Forms such as the pincode checker and contact form need the server, so they don't work in the preview.

## PWA installation

ReWear ships a web app manifest, generated icons (`npm run icons`), a service worker with an offline fallback page, an install prompt, an update prompt, and an offline banner. The service worker caches only immutable build assets, icons and public editorial images — **never** API responses or authenticated pages, so no financial or personal data is stored offline.

- **Android (Chrome/Edge/Samsung):** open the site → *Install app* (or ⋮ → *Install app*).
- **iPhone/iPad (Safari, iOS 16.4+):** Share → *Add to Home Screen*.
- **Desktop (Chrome/Edge):** install icon in the address bar.

Full instructions are on `/install`. The service worker registers in production builds; set `NEXT_PUBLIC_SW_DEV=true` to test it under `next dev`.

## Delivery phases

All six phases are implemented on the shared schema and services:

1. Public website, authentication, customer dashboard, KG calculator, booking, pricing
2. Collector app, digital weighing, customer approval, pickup management
3. Admin dashboard, direct UPI payouts, payment history, reports & exports
4. Warehouse receiving, sorting, inventory
5. Premium marketplace, B2B portal, recycling, donations
6. Analytics, referrals & rewards, automation (auto-assignment, auto-approval, reconciliation). AI clothing classification is behind the `integrations.aiClassification` flag as an extension point.

## Imagery & testimonials

Editorial photography is from Unsplash (hot-linked under the Unsplash licence) and was chosen to show real garments and textile sorting. The homepage testimonial section only renders entries an admin adds under Settings → Verified testimonials (real customers, consent date, completed booking code); until then it says so honestly.
