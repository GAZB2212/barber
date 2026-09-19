# Chairtime

A white-label booking site for barbershops. One codebase, many shops: each
tenant gets its own branding, services, staff, hours and booking rules.

Built after trying to book a haircut on the incumbents. The design goals come
straight from where those fall down on a phone.

## Why this exists

| Problem | What this does instead |
| --- | --- |
| Service lists trapped inside modals that will not scroll | The booking flow is **full-page steps**. No modals, no locked `body`, no inner scroll containers. A test asserts the page is scrollable and `overflow` is never `hidden`. |
| Forced account creation, then silent logouts and re-registration loops | **No account needed.** A name plus an email or mobile is enough. Customers manage bookings from an unguessable link. |
| Getting locked to one barber once a booking starts | Barber is a step you can go **back** to, and "anyone available" is a first-class option. |
| Barbers surprised by appointments; double bookings | A Postgres **exclusion constraint** makes two appointments in one barber's chair impossible, not merely unlikely. |
| Tiny tap targets | Every control is **at least 44px**, asserted in a browser test across pages. |

## Running it

```bash
npm install
npm run dev
```

Open <http://localhost:3000/demo>. **No database or keys are needed** — with
Supabase unconfigured the app serves a built-in demo shop, so you can try the
whole flow (and show it to a barber) immediately. Demo bookings live in memory,
scoped per visitor by a cookie, and vanish on restart.

To run against a real database, copy `.env.example` to `.env.local`, fill in
your Supabase credentials, and apply the migrations in `supabase/migrations/`
in order.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests (the slot engine) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run e2e` | Browser tests (needs a server on `:3100`) |

`scripts/screenshots.mjs` captures the flow at phone width.

## How it fits together

```
src/lib/availability.ts   Pure slot engine. No DB, no framework, no clock.
src/lib/shop.ts           Loads a tenant and its availability inputs.
src/lib/booking.ts        Server actions: create and cancel a booking.
src/lib/theme.ts          Per-shop colours and type, as CSS custom properties.
src/lib/demo.ts           The keyless demo shop.
src/app/[shop]/           The public, per-tenant site.
supabase/migrations/      Schema, then row-level security.
```

### The slot engine

`slotsForDay` takes every input explicitly — including `now` — so it is
deterministic and testable, and so that **offering** a slot and
**re-validating** it at booking time run identical logic. It handles split
shifts, per-barber hours, lead time, booking horizon, closures, time off and
existing appointments.

Wall-clock times are stepped in the shop's timezone and converted per slot,
rather than adding milliseconds to a start instant. That is what keeps a
09:00 slot at 09:00 on the days the UK clocks change; both transitions are
covered by tests.

### Tenancy and privacy

Everything hangs off `shops.id` and is enforced by row-level security, not by
application code remembering to filter.

Customer records and appointments are never publicly readable. The booking UI
gets free/busy from `public_busy_windows()`, which returns **time ranges
only** — a visitor can see that 10:00 is taken, never who took it or what they
booked.

### Prices

Appointments snapshot the name, duration and price quoted at booking time, so
raising a price later cannot rewrite what a past customer was charged.

## Not built yet

- **Payments and deposits.** Deliberately out of scope for v1; prices are
  display-only and settled in the shop.
- **Barber admin.** The schema, RLS and staff roles are in place; the
  dashboard UI is not.
- **Notifications.** The confirmation screen shows the manage link, but no
  email or SMS is sent yet.
- **Generated database types.** Queries are hand-typed; run
  `supabase gen types typescript` once a project exists.
- **Safari.** Browser tests run on Chromium only, which is what the sandbox
  has. The scroll behaviour this project exists to fix should be confirmed on
  a real iPhone.
