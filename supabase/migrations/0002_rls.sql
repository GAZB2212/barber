-- Row-level security.
--
-- Two audiences:
--   anon  - the public booking site. Reads the shop's menu, writes nothing.
--           Bookings are created by a server action holding the service-role
--           key, which re-validates availability before inserting.
--   staff - signed-in barbers/owners, scoped to the shops they belong to.

alter table shops                enable row level security;
alter table staff                enable row level security;
alter table services             enable row level security;
alter table staff_services       enable row level security;
alter table opening_hours        enable row level security;
alter table closures             enable row level security;
alter table time_off             enable row level security;
alter table customers            enable row level security;
alter table appointments         enable row level security;
alter table appointment_services enable row level security;

-- Membership test. SECURITY DEFINER so that policies on `staff` can call it
-- without re-entering `staff`'s own policy and recursing.
create or replace function is_staff_of(target_shop uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from staff
    where staff.shop_id = target_shop
      and staff.user_id = auth.uid()
      and staff.is_active
  );
$$;

create or replace function is_manager_of(target_shop uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from staff
    where staff.shop_id = target_shop
      and staff.user_id = auth.uid()
      and staff.is_active
      and staff.role in ('owner', 'manager')
  );
$$;

revoke execute on function is_staff_of(uuid)   from public;
revoke execute on function is_manager_of(uuid) from public;
grant  execute on function is_staff_of(uuid)   to authenticated;
grant  execute on function is_manager_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public read: everything needed to render the shop and compute free slots.
-- ---------------------------------------------------------------------------

create policy shops_public_read on shops
  for select to anon, authenticated
  using (is_published);

create policy staff_public_read on staff
  for select to anon, authenticated
  using (is_active and exists (
    select 1 from shops s where s.id = staff.shop_id and s.is_published
  ));

create policy services_public_read on services
  for select to anon, authenticated
  using (is_active and exists (
    select 1 from shops s where s.id = services.shop_id and s.is_published
  ));

create policy staff_services_public_read on staff_services
  for select to anon, authenticated
  using (exists (
    select 1 from staff st
    join shops s on s.id = st.shop_id
    where st.id = staff_services.staff_id and s.is_published and st.is_active
  ));

create policy opening_hours_public_read on opening_hours
  for select to anon, authenticated
  using (exists (
    select 1 from shops s where s.id = opening_hours.shop_id and s.is_published
  ));

create policy closures_public_read on closures
  for select to anon, authenticated
  using (exists (
    select 1 from shops s where s.id = closures.shop_id and s.is_published
  ));

-- Absences are readable because free/busy is needed to offer slots. Only the
-- window is exposed; `reason` is stripped by the public availability query.
create policy time_off_public_read on time_off
  for select to anon, authenticated
  using (exists (
    select 1 from shops s where s.id = time_off.shop_id and s.is_published
  ));

-- ---------------------------------------------------------------------------
-- Appointments and customers: never public.
--
-- Free/busy for the booking UI comes from public_busy_windows() below, which
-- returns times only -- never who the customer is or what they booked.
-- ---------------------------------------------------------------------------

create policy appointments_staff_read on appointments
  for select to authenticated using (is_staff_of(shop_id));
create policy appointments_staff_write on appointments
  for insert to authenticated with check (is_staff_of(shop_id));
create policy appointments_staff_update on appointments
  for update to authenticated using (is_staff_of(shop_id))
                              with check (is_staff_of(shop_id));

create policy appointment_services_staff_read on appointment_services
  for select to authenticated using (exists (
    select 1 from appointments a
    where a.id = appointment_services.appointment_id and is_staff_of(a.shop_id)
  ));
create policy appointment_services_staff_write on appointment_services
  for all to authenticated using (exists (
    select 1 from appointments a
    where a.id = appointment_services.appointment_id and is_staff_of(a.shop_id)
  )) with check (exists (
    select 1 from appointments a
    where a.id = appointment_services.appointment_id and is_staff_of(a.shop_id)
  ));

create policy customers_staff_read on customers
  for select to authenticated using (is_staff_of(shop_id));
create policy customers_staff_write on customers
  for all to authenticated using (is_staff_of(shop_id))
                           with check (is_staff_of(shop_id));

-- ---------------------------------------------------------------------------
-- Staff-managed configuration
-- ---------------------------------------------------------------------------

create policy shops_staff_read on shops
  for select to authenticated using (is_staff_of(id));
create policy shops_manager_update on shops
  for update to authenticated using (is_manager_of(id))
                              with check (is_manager_of(id));

create policy staff_self_read on staff
  for select to authenticated using (is_staff_of(shop_id));
create policy staff_manager_write on staff
  for all to authenticated using (is_manager_of(shop_id))
                           with check (is_manager_of(shop_id));

create policy services_manager_write on services
  for all to authenticated using (is_manager_of(shop_id))
                           with check (is_manager_of(shop_id));

create policy staff_services_manager_write on staff_services
  for all to authenticated using (exists (
    select 1 from staff st
    where st.id = staff_services.staff_id and is_manager_of(st.shop_id)
  )) with check (exists (
    select 1 from staff st
    where st.id = staff_services.staff_id and is_manager_of(st.shop_id)
  ));

create policy opening_hours_manager_write on opening_hours
  for all to authenticated using (is_manager_of(shop_id))
                           with check (is_manager_of(shop_id));

create policy closures_manager_write on closures
  for all to authenticated using (is_manager_of(shop_id))
                           with check (is_manager_of(shop_id));

-- A barber may book their own time off; managers may book anyone's.
create policy time_off_staff_write on time_off
  for all to authenticated
  using (
    is_manager_of(shop_id)
    or exists (select 1 from staff st
               where st.id = time_off.staff_id and st.user_id = auth.uid())
  )
  with check (
    is_manager_of(shop_id)
    or exists (select 1 from staff st
               where st.id = time_off.staff_id and st.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Public free/busy
--
-- The booking UI needs to know a barber is busy 10:00-10:45; it must not learn
-- that it is Dave in for a skin fade. This returns opaque windows only.
-- ---------------------------------------------------------------------------

create or replace function public_busy_windows(
  target_shop uuid,
  window_start timestamptz,
  window_end timestamptz
)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select a.staff_id, a.starts_at, a.ends_at
  from appointments a
  join shops s on s.id = a.shop_id
  where a.shop_id = target_shop
    and s.is_published
    and a.status <> 'cancelled'
    and a.starts_at < window_end
    and a.ends_at   > window_start;
$$;

grant execute on function public_busy_windows(uuid, timestamptz, timestamptz)
  to anon, authenticated;
