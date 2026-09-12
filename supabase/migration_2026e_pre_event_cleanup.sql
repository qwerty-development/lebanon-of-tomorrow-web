-- ============================================================================
-- 2026e — pre-event cleanup
--
-- Removes 2025 objects that are still live in the database but exist in no
-- file here, and that nothing in the app calls. Verified unused against
-- app/, components/ and lib/ before writing this.
--
-- Deliberately does NOT touch check_in_field(), undo_check_in(),
-- status_enforce_rules(), can_user_modify_field() or search_attendees().
-- Those were exercised end to end against the 2026 data and all eight
-- station/permission/quantity rules behaved correctly. Working code on the
-- eve of the event is left alone.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. prevent_unclaim — a live trigger that throws on every UPDATE
--
-- It guards columns (main_entrance_at, medical_check_at, dental_check_at,
-- stationary_backpack_at) that were dropped from public.attendees in 2025, so
-- the moment its body is evaluated Postgres raises
--     42703: record "old" has no field "main_entrance_at"
--
-- It only escapes notice because the body sits behind
-- `if not is_super_admin(auth.uid())`, and the attendees_update RLS policy
-- already limits updates to super admins, for whom the branch short-circuits.
-- Any future non-super-admin update path would fail with that message.
-- The rule it was written to enforce (no unchecking) now lives in
-- status_enforce_rules() on attendee_field_status, which is tested and works.
-- ---------------------------------------------------------------------------
drop trigger if exists attendees_prevent_unclaim on public.attendees;
drop function if exists public.prevent_unclaim();

-- ---------------------------------------------------------------------------
-- 2. attendee_summary — stale materialised view, readable over the API
--
-- Held 652 rows against 1075 live attendees, i.e. a snapshot of a previous
-- dataset. Nothing reads it (no reference anywhere in app/, components/, lib/)
-- and it was exposed to anon/authenticated, so it served only to publish
-- out-of-date names and phone numbers.
-- ---------------------------------------------------------------------------
drop materialized view if exists public.attendee_summary;

-- ---------------------------------------------------------------------------
-- 3. Functions left over from the events-based 2025 model
--
-- set_active_event() reads public.events, a table that no longer exists, so it
-- can only ever error. reset_attendance(uuid) is the events-era variant; the
-- app calls the no-argument reset_attendance(), and carrying both makes the
-- PostgREST overload resolution depend on the request body shape for no gain.
-- ---------------------------------------------------------------------------
drop function if exists public.set_active_event(uuid);
drop function if exists public.reset_attendance(uuid);

-- ---------------------------------------------------------------------------
-- 4. Pre-2026 role helpers
--
-- Both still branch on the retired 'shabebik' / 'medical' / 'dental' roles and
-- read public.user_field_access, which has been empty since the role model
-- moved to one enum value per station. Access is decided by
-- can_user_modify_field(); these two are unreferenced by the app and by any
-- trigger, view or policy.
-- ---------------------------------------------------------------------------
drop function if exists public.user_has_field_access(uuid, uuid);
drop function if exists public.get_user_accessible_fields(uuid);

-- ---------------------------------------------------------------------------
-- 5. profiles.email — populate it
--
-- check_in_field() returns checked_by_email by reading profiles.email, and the
-- attendees screen shows it when an operator loses a race for a station
-- ("already checked in by ..."). The column was NULL for all 15 accounts, so
-- that message was losing the one detail that makes it actionable.
-- ---------------------------------------------------------------------------
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- Keep it populated for accounts created from here on.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- New accounts land with no station and cannot check anyone in until a
  -- super admin assigns a role in Super Admin > Users & Roles, where they are
  -- listed under the amber "no station yet" banner.
  --
  -- Until now the default was 'admin', which reaches EVERY station: anyone who
  -- obtained an account was immediately able to check in anywhere. Failing
  -- closed is the safer default, and promoting an account takes one dropdown.
  insert into public.profiles (id, role, email)
  values (new.id, 'none', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
