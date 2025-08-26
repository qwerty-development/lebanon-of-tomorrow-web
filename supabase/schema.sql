-- Supabase schema for Lebanon of Tomorrow Attendance & Distribution
-- Arabic-safe (ICU collation) and realtime-ready. Updated to avoid NEW/OLD in RLS.

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Roles enum
do $$
begin
  if not exists (
    select 1 from pg_type typ
    join pg_namespace nsp on nsp.oid = typ.typnamespace
    where typ.typname = 'user_role' and nsp.nspname = 'public'
  ) then
    create type public.user_role as enum ('admin','super_admin');
  end if;
end$$;

-- Profiles (Auth users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'admin')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Role helpers
create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id = uid and p.role = 'super_admin');
$$;

-- Dynamic Fields (global, no events)
create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  name text collate "ar-x-icu" not null unique,
  is_enabled boolean not null default true,
  sort_order integer not null default 100,
  is_main boolean not null default false,
  created_at timestamptz not null default now()
);
-- Ensure only one main field globally
create unique index if not exists uniq_one_main_field on public.fields ((is_main)) where is_main;

create table if not exists public.attendees (
  id uuid primary key default gen_random_uuid(),
  name text collate "ar-x-icu" not null,
  record_number text not null,
  governorate text collate "ar-x-icu" not null,
  district text collate "ar-x-icu" not null,
  area text collate "ar-x-icu" not null,
  phone text null,
  quantity integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendees_unique_record unique (record_number)
);

-- Remove legacy dependencies/policies that might reference event_id (idempotent)
drop policy if exists attendees_select on public.attendees;
drop policy if exists attendees_insert on public.attendees;
drop policy if exists attendees_update on public.attendees;

-- Remove event_id and old station columns when present (idempotent)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='attendees' and column_name='event_id') then
    alter table public.attendees drop column event_id;
  end if;
  if exists (select 1 from information_schema.table_constraints where table_schema='public' and table_name='attendees' and constraint_name='attendees_unique_record_per_event') then
    alter table public.attendees drop constraint attendees_unique_record_per_event;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='attendees' and column_name='main_entrance_at') then
    alter table public.attendees drop column main_entrance_at;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='attendees' and column_name='medical_check_at') then
    alter table public.attendees drop column medical_check_at;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='attendees' and column_name='dental_check_at') then
    alter table public.attendees drop column dental_check_at;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='attendees' and column_name='stationary_backpack_at') then
    alter table public.attendees drop column stationary_backpack_at;
  end if;
end $$;

-- Status of fields per attendee
create table if not exists public.attendee_field_status (
  attendee_id uuid not null references public.attendees(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  checked_at timestamptz null,
  quantity integer not null default 1 check (quantity >= 1),
  primary key (attendee_id, field_id)
);

-- Updated timestamp
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendees_set_updated_at on public.attendees;
create trigger attendees_set_updated_at
before update on public.attendees
for each row
execute function public.set_updated_at();

create index if not exists idx_attendees_name_trgm on public.attendees using gin (name gin_trgm_ops);
create index if not exists idx_attendees_record_trgm on public.attendees using gin (record_number gin_trgm_ops);
create index if not exists idx_status_checked on public.attendee_field_status(checked_at);

alter publication supabase_realtime add table public.attendees;
alter publication supabase_realtime add table public.attendee_field_status;
alter publication supabase_realtime add table public.fields;

alter table public.profiles enable row level security;
alter table public.attendees enable row level security;
alter table public.fields enable row level security;
alter table public.attendee_field_status enable row level security;

-- Profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_super_admin(auth.uid()));

-- Fields policies
drop policy if exists fields_select on public.fields;
create policy fields_select on public.fields for select to authenticated using (true);

drop policy if exists fields_insert on public.fields;
create policy fields_insert on public.fields for insert to authenticated using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists fields_update on public.fields;
create policy fields_update on public.fields for update to authenticated using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists fields_delete on public.fields;
create policy fields_delete on public.fields for delete to authenticated using (public.is_super_admin(auth.uid()));

drop policy if exists attendees_select on public.attendees;
create policy attendees_select on public.attendees for select to authenticated using (true);

drop policy if exists attendees_insert on public.attendees;
create policy attendees_insert on public.attendees for insert to authenticated with check (true);

drop policy if exists attendees_update on public.attendees;
create policy attendees_update on public.attendees for update to authenticated using (true) with check (true);

-- Prevent uncheck & enforce gating in attendee_field_status
create or replace function public.status_enforce_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_main_field boolean;
  has_main boolean;
  attendee_qty integer;
begin
  -- prevent uncheck by non-super-admins
  if tg_op = 'UPDATE' then
    if old.checked_at is not null and new.checked_at is null and not public.is_super_admin(auth.uid()) then
      raise exception 'Unchecking is not allowed';
    end if;
  end if;

  -- set timestamp when marking
  if new.checked_at is null then
    -- allow explicit uncheck (null) on UPDATE; permission enforced above
    if tg_op = 'UPDATE' and old.checked_at is not null then
      return new;
    end if;
    -- otherwise, if inserting or marking as checked without timestamp, set it now
    new.checked_at = now();
  end if;

  -- ensure quantity is valid
  if new.quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  -- get attendee's total quantity
  select quantity into attendee_qty from public.attendees where id = new.attendee_id;
  if new.quantity > attendee_qty then
    raise exception 'Quantity cannot exceed attendee total quantity';
  end if;

  -- gating: if field is not main, ensure main is checked for same attendee
  select is_main into is_main_field from public.fields where id = new.field_id;
  if coalesce(is_main_field, false) = false then
    select exists(
      select 1 from public.attendee_field_status s
      join public.fields f on f.id = s.field_id and f.is_main = true
      where s.attendee_id = new.attendee_id and s.checked_at is not null
    ) into has_main;
    if not coalesce(has_main, false) then
      raise exception 'Main entrance must be checked first';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists status_enforce_rules_insert on public.attendee_field_status;
create trigger status_enforce_rules_insert
before insert on public.attendee_field_status
for each row execute function public.status_enforce_rules();

drop trigger if exists status_enforce_rules_update on public.attendee_field_status;
create trigger status_enforce_rules_update
before update on public.attendee_field_status
for each row execute function public.status_enforce_rules();

-- Policies for status table
drop policy if exists status_select on public.attendee_field_status;
create policy status_select on public.attendee_field_status for select to authenticated using (true);

drop policy if exists status_insert on public.attendee_field_status;
create policy status_insert on public.attendee_field_status for insert to authenticated with check (true);

drop policy if exists status_update on public.attendee_field_status;
create policy status_update on public.attendee_field_status for update to authenticated using (true) with check (true);

drop policy if exists attendees_delete_super on public.attendees;
create policy attendees_delete_super on public.attendees
for delete to authenticated
using (public.is_super_admin(auth.uid()));

create or replace function public.reset_attendance()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only super_admin can reset attendance';
  end if;
  update public.attendee_field_status set checked_at = null where checked_at is not null;
end;
$$;

revoke all on function public.reset_attendance() from public;
grant execute on function public.reset_attendance() to authenticated;

create or replace function public.reset_attendance_selective(p_field_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only super_admin can reset attendance';
  end if;
  update public.attendee_field_status s
     set checked_at = null
   where s.field_id = any(p_field_ids) and s.checked_at is not null;
end;
$$;

revoke all on function public.reset_attendance_selective(uuid[]) from public;
grant execute on function public.reset_attendance_selective(uuid[]) to authenticated;

-- RPC: set active event (sets all others to inactive)
create or replace function public.set_active_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only super_admin can set active event';
  end if;
  update public.events set is_active = false where id <> p_event_id;
  update public.events set is_active = true where id = p_event_id;
end;
$$;

revoke all on function public.set_active_event(uuid) from public;
grant execute on function public.set_active_event(uuid) to authenticated;

-- RPC: add attendee (security definer to avoid client RLS pitfalls)
create or replace function public.add_attendee(
  p_name text,
  p_record_number text,
  p_governorate text,
  p_district text,
  p_area text,
  p_phone text,
  p_quantity integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.attendees(name, record_number, governorate, district, area, phone, quantity)
  values (p_name, p_record_number, p_governorate, p_district, p_area, p_phone, greatest(coalesce(p_quantity, 1), 1))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  -- rethrow with clearer message
  raise exception 'Record number already exists' using errcode = '23505';
end;
$$;

revoke all on function public.add_attendee(text,text,text,text,text,text,integer) from public;
grant execute on function public.add_attendee(text,text,text,text,text,text,integer) to authenticated;

-- Seed default field (Main entrance) if none exists
insert into public.fields(name, is_enabled, sort_order, is_main)
select 'Main entrance', true, 1, true
where not exists (select 1 from public.fields);

-- Optional: sample Arabic attendees (replace <EVENT_ID>)
-- insert into public.attendees(event_id, name, record_number, governorate, district, area, phone, quantity)
-- values
--   (<EVENT_ID>, 'محمد علي', 'REC-0001', 'بيروت', 'بيروت', 'المزرعة', '70123456', 1),
--   (<EVENT_ID>, 'ليلى حسن', 'REC-0002', 'جبل لبنان', 'المتن', 'سن الفيل', null, 2);

