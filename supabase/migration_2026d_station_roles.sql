-- ============================================================================
-- 2026d — station roles
--
-- The 2026 stations replaced the 2025 ones, so the role list is reworked to
-- match them one-for-one. `admin` and `super_admin` are untouched: full access.
--
--   main_entrance        -> "Main entrance"            (also any is_main field)
--   stationary_backpacks -> "Stationary and Backpacks"
--   dental_usj           -> "Dental Check (USJ)"
--   medical_lau          -> "Medical test (LAU)"
--   optic_et_vision      -> "Optic et vision"
--   lg_sealco            -> "LG Sealco"
--   bey_1                -> "Bey 1"
--   none                 -> no station at all (safe parking spot)
--
-- HOW THE ENUM IS CHANGED, AND WHY THIS WAY
-- Rebuilding the type and re-casting profiles.role fails on a live database:
--   ERROR: cannot alter type of a column used in a policy definition
-- because RLS policies read profiles.role. Instead this migration renames the
-- retired values in place and adds the missing ones. Nothing touches the
-- column, so no policy, view, function or trigger has to be dropped.
--
-- Renaming carries each account over with its value:
--   'medical'  -> 'medical_lau'   same station, new venue
--   'dental'   -> 'dental_usj'    same station, new venue
--   'shabebik' -> 'none'          retired with no 2026 equivalent, so those
--                                 accounts are parked and must be reassigned
-- Reassign anyone who should land somewhere else in Super Admin > Users
-- & Roles, or with update_user_role() below.
--
-- Matching is on the station NAME (case-insensitive substring), so renaming
-- "Dental Check (USJ)" to "Dental Check (USJ) - tent 2" keeps working, but
-- renaming it to something with no dental/usj in it does NOT. Keep the
-- keywords in the name, or add the new keyword to the lists below.
--
-- Safe to run more than once.
-- ============================================================================

-- 1. Rename the retired values, add the new ones -----------------------------
-- Kept out of an explicit transaction: "alter type ... add value" may not be
-- followed by a use of that value in the same transaction. Each statement is
-- individually idempotent instead.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('shabebik', 'none'),
      ('medical',  'medical_lau'),
      ('dental',   'dental_usj')
    ) as t(old_label, new_label)
  loop
    -- Already renamed by an earlier run.
    if not exists (
      select 1 from pg_enum
      where enumtypid = 'public.user_role'::regtype and enumlabel = r.old_label
    ) then
      continue;
    end if;

    -- Both labels present, which happens if something re-added the retired one
    -- (re-running migration_role_based_access.sql does exactly that). A label
    -- cannot be dropped, so leave it alone and say so rather than failing.
    if exists (
      select 1 from pg_enum
      where enumtypid = 'public.user_role'::regtype and enumlabel = r.new_label
    ) then
      raise notice 'user_role still carries retired label %; % already exists, so no rename. Reassign any account on % by hand.',
        r.old_label, r.new_label, r.old_label;
      continue;
    end if;

    execute format('alter type public.user_role rename value %L to %L', r.old_label, r.new_label);
    raise notice 'renamed user_role value % -> %', r.old_label, r.new_label;
  end loop;
end $$;

alter type public.user_role add value if not exists 'main_entrance';
alter type public.user_role add value if not exists 'stationary_backpacks';
alter type public.user_role add value if not exists 'lg_sealco';
alter type public.user_role add value if not exists 'bey_1';
alter type public.user_role add value if not exists 'none';
alter type public.user_role add value if not exists 'medical_lau';
alter type public.user_role add value if not exists 'dental_usj';

-- 2. Name matching helper ----------------------------------------------------
create or replace function public.field_matches_any(field_name text, patterns text[])
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(patterns) as p
    where position(p in lower(coalesce(field_name, ''))) > 0
  );
$$;

grant execute on function public.field_matches_any(text, text[]) to authenticated;

-- 3. Per-role station access -------------------------------------------------
-- Keep this list in sync with ROLE_FIELD_PATTERNS in lib/roleUtils.ts.
--
-- The 2025 signature was (user_role, text). The is_main flag is new, so the
-- old two-argument version is dropped first — leaving both would make a
-- two-argument call ambiguous. The debug view depends on it, so that goes too
-- and is rebuilt in step 6.
drop view if exists public.role_field_permissions;
drop function if exists public.can_user_modify_field(public.user_role, text);

create or replace function public.can_user_modify_field(
  user_role     public.user_role,
  field_name    text,
  field_is_main boolean default false
)
returns boolean
language plpgsql
stable
security definer
as $$
begin
  -- Full access, unchanged from 2025.
  if user_role in ('super_admin', 'admin') then
    return true;
  end if;

  -- Whoever runs the door owns the main station, whatever it is called.
  if user_role = 'main_entrance' and coalesce(field_is_main, false) then
    return true;
  end if;

  return case user_role
    when 'main_entrance' then
      public.field_matches_any(field_name, array['main entrance', 'main gate', 'مدخل'])
    when 'stationary_backpacks' then
      public.field_matches_any(field_name, array['stationary', 'stationery', 'backpack', 'قرطاسية', 'حقائب', 'حقيبة'])
    when 'dental_usj' then
      public.field_matches_any(field_name, array['dental', 'usj', 'أسنان'])
    when 'medical_lau' then
      public.field_matches_any(field_name, array['medical', 'lau', 'طبي'])
    when 'optic_et_vision' then
      public.field_matches_any(field_name, array['optic', 'vision', 'بصر', 'نظر', 'عيون'])
    when 'lg_sealco' then
      public.field_matches_any(field_name, array['sealco'])
    when 'bey_1' then
      public.field_matches_any(field_name, array['bey 1', 'bey1', 'بيروت 1'])
    else
      false   -- 'none', and anything added later without a mapping
  end;
end;
$$;

grant execute on function public.can_user_modify_field(public.user_role, text, boolean) to authenticated;

-- 4. Trigger now hands the is_main flag to the check --------------------------
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
  user_role public.user_role;
  field_name text;
begin
  select p.role into user_role
  from public.profiles p
  where p.id = auth.uid();

  select f.name, f.is_main into field_name, is_main_field
  from public.fields f
  where f.id = new.field_id;

  if not public.can_user_modify_field(user_role, field_name, coalesce(is_main_field, false)) then
    raise exception 'You do not have permission to modify this field';
  end if;

  -- prevent uncheck by non-super-admins
  if tg_op = 'UPDATE' then
    if old.checked_at is not null and new.checked_at is null and not public.is_super_admin(auth.uid()) then
      raise exception 'Unchecking is not allowed';
    end if;
  end if;

  -- set timestamp when marking
  if new.checked_at is null then
    if tg_op = 'UPDATE' and old.checked_at is not null then
      return new;
    end if;
    new.checked_at = now();
  end if;

  if new.quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  select quantity into attendee_qty from public.attendees where id = new.attendee_id;
  if new.quantity > attendee_qty then
    raise exception 'Quantity cannot exceed attendee total quantity';
  end if;

  -- gating: if field is not main, ensure main is checked for same attendee
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

-- 5. Admin helpers (unchanged bodies, kept here so the file is self-contained)
create or replace function public.list_all_users()
returns table (
  id uuid,
  email text,
  role public.user_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only super admins can list all users';
  end if;

  -- auth.users.email is varchar(255); this function declares text, and
  -- RETURN QUERY demands an exact type match. Without the cast:
  --   "structure of query does not match function result type"
  return query
  select p.id, u.email::text, p.role, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

revoke all on function public.list_all_users() from public;
grant execute on function public.list_all_users() to authenticated;

create or replace function public.update_user_role(p_user_id uuid, p_new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only super admins can update user roles';
  end if;

  update public.profiles
  set role = p_new_role, updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.update_user_role(uuid, public.user_role) from public;
grant execute on function public.update_user_role(uuid, public.user_role) to authenticated;

-- 6. Debug view: which role reaches which station -----------------------------
create or replace view public.role_field_permissions as
select
  r.role,
  f.name as field_name,
  public.can_user_modify_field(r.role, f.name, f.is_main) as can_modify
from (select unnest(enum_range(null::public.user_role)) as role) r
cross join public.fields f
order by r.role, f.sort_order;

grant select on public.role_field_permissions to authenticated;

-- Check the result, then reassign anyone parked on 'none':
--   select enum_range(null::public.user_role);
--   select * from public.role_field_permissions order by role, field_name;
--   select id, email, role from public.list_all_users();
--   select public.update_user_role('<user-uuid>', 'main_entrance');
