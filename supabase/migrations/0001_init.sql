-- Barber booking platform: core multi-tenant schema.
-- Every tenant is a row in `shops`; every other table hangs off shop_id.

create extension if not exists "btree_gist";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

create table shops (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                          check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  name                  text not null,
  tagline               text,
  about                 text,
  phone                 text,
  email                 text,
  address_line1         text,
  address_line2         text,
  city                  text,
  postcode              text,
  country               text not null default 'GB',
  timezone              text not null default 'Europe/London',

  -- Booking policy. Every shop tunes these itself.
  slot_interval_minutes int  not null default 15 check (slot_interval_minutes between 5 and 60),
  lead_time_minutes     int  not null default 60 check (lead_time_minutes >= 0),
  horizon_days          int  not null default 60 check (horizon_days between 1 and 365),
  cancellation_hours    int  not null default 24 check (cancellation_hours >= 0),
  max_services_per_booking int not null default 4 check (max_services_per_booking between 1 and 10),

  -- White-label presentation. Shape is validated in the app (lib/theme.ts).
  theme                 jsonb not null default '{}'::jsonb,
  logo_url              text,

  is_published          boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column shops.slot_interval_minutes is
  'Granularity of offered start times, e.g. 15 => :00 :15 :30 :45.';
comment on column shops.lead_time_minutes is
  'Minimum notice before an appointment may start.';

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

create type staff_role as enum ('owner', 'manager', 'barber');

create table staff (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references shops(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  name             text not null,
  role             staff_role not null default 'barber',
  bio              text,
  avatar_url       text,
  display_order    int not null default 0,
  accepts_bookings boolean not null default true,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- A given auth user holds at most one staff record per shop.
create unique index staff_shop_user_idx on staff (shop_id, user_id)
  where user_id is not null;
create index staff_shop_idx on staff (shop_id) where is_active;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------

create table services (
  id                   uuid primary key default gen_random_uuid(),
  shop_id              uuid not null references shops(id) on delete cascade,
  name                 text not null,
  description          text,
  category             text,
  duration_minutes     int not null check (duration_minutes between 5 and 480),
  -- Display only: v1 takes no payment, the client settles in the shop.
  price_pence          int not null default 0 check (price_pence >= 0),
  buffer_after_minutes int not null default 0 check (buffer_after_minutes between 0 and 120),
  display_order        int not null default 0,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

create index services_shop_idx on services (shop_id) where is_active;

-- Which barber performs which service, with optional per-barber overrides
-- (a senior barber may charge more, or be quicker).
create table staff_services (
  staff_id                  uuid not null references staff(id) on delete cascade,
  service_id                uuid not null references services(id) on delete cascade,
  duration_override_minutes int check (duration_override_minutes between 5 and 480),
  price_override_pence      int check (price_override_pence >= 0),
  primary key (staff_id, service_id)
);

-- ---------------------------------------------------------------------------
-- Availability: recurring hours, plus dated exceptions
-- ---------------------------------------------------------------------------

-- staff_id null => the shop's default week. A row with staff_id set replaces
-- the shop default for that barber on that weekday.
create table opening_hours (
  id        uuid primary key default gen_random_uuid(),
  shop_id   uuid not null references shops(id) on delete cascade,
  staff_id  uuid references staff(id) on delete cascade,
  weekday   int not null check (weekday between 0 and 6),  -- 0 = Sunday
  opens_at  time not null,
  closes_at time not null,
  check (closes_at > opens_at)
);

create index opening_hours_lookup_idx on opening_hours (shop_id, staff_id, weekday);

-- Whole-shop closures (bank holidays, refurb).
create table closures (
  id      uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  on_date date not null,
  reason  text,
  unique (shop_id, on_date)
);

-- Per-barber absence, at timestamp precision (holiday, dentist, lunch).
create table time_off (
  id        uuid primary key default gen_random_uuid(),
  shop_id   uuid not null references shops(id) on delete cascade,
  staff_id  uuid not null references staff(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text,
  check (ends_at > starts_at)
);

create index time_off_lookup_idx on time_off (staff_id, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

-- Deliberately not tied to auth.users: booking must work without an account.
-- user_id is populated only if the customer later signs in to manage bookings.
create table customers (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create unique index customers_shop_email_idx on customers (shop_id, lower(email))
  where email is not null;
create index customers_shop_phone_idx on customers (shop_id, phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------

create type appointment_status as enum
  ('confirmed', 'cancelled', 'completed', 'no_show');

create table appointments (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references shops(id) on delete cascade,
  staff_id           uuid not null references staff(id) on delete restrict,
  customer_id        uuid not null references customers(id) on delete restrict,
  starts_at          timestamptz not null,
  -- Includes each service's trailing buffer, so it is the true block of the
  -- barber's time. Display uses appointment_services durations instead.
  ends_at            timestamptz not null,
  status             appointment_status not null default 'confirmed',
  customer_note      text,
  staff_note         text,
  -- Lets a customer manage their booking from an emailed link, no account.
  manage_token       uuid not null default gen_random_uuid(),
  cancelled_at       timestamptz,
  cancelled_by       text check (cancelled_by in ('customer', 'shop')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index appointments_manage_token_idx on appointments (manage_token);
create index appointments_shop_window_idx on appointments (shop_id, starts_at);
create index appointments_staff_window_idx on appointments (staff_id, starts_at);

-- The whole point: the database itself refuses to double-book a barber.
-- Cancelled appointments are excluded so a slot frees up immediately.
alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled');

-- Price and duration are snapshotted here: changing a service's price later
-- must not rewrite what a past customer was quoted.
create table appointment_services (
  id               uuid primary key default gen_random_uuid(),
  appointment_id   uuid not null references appointments(id) on delete cascade,
  service_id       uuid references services(id) on delete set null,
  name             text not null,
  duration_minutes int not null,
  price_pence      int not null,
  position         int not null default 0
);

create index appointment_services_appointment_idx
  on appointment_services (appointment_id);

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shops_updated_at before update on shops
  for each row execute function set_updated_at();
create trigger appointments_updated_at before update on appointments
  for each row execute function set_updated_at();
