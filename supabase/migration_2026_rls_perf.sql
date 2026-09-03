-- ============================================================================
-- Lebanon of Tomorrow — 2026 hardening + performance migration
-- Run once, top to bottom, in the Supabase SQL editor.
--   1. Locks the database down with RLS (it is currently WIDE OPEN)
--   2. Backend enforcement of the pre_collected rule
--   3. Indexes for the filters the dashboard actually runs
--   4. Aggregate RPCs so the UI stops making N+1 round trips
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Columns (idempotent — safe if you already added them)
-- ---------------------------------------------------------------------------
alter table public.attendees
  add column if not exists batch text not null default 'main',
  add column if not exists pre_collected boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1. LOCK IT DOWN
-- Anon (the key shipped in the browser bundle) must have nothing at all.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter table public.profiles              enable row level security;
alter table public.attendees             enable row level security;
alter table public.fields                enable row level security;
alter table public.attendee_field_status enable row level security;
alter table public.user_field_access     enable row level security;

-- Helper: is the caller a super admin? SECURITY DEFINER so it can read
-- profiles without tripping that table's own policy.
create or replace function public.is_super_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = uid and p.role = 'super_admin');
$$;

-- profiles: you see yourself; super admins see everyone. Nobody self-promotes.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists profiles_update_super on public.profiles;
create policy profiles_update_super on public.profiles for update to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- attendees: any logged-in staff member reads; only super admins write.
drop policy if exists attendees_select on public.attendees;
create policy attendees_select on public.attendees for select to authenticated using (true);

drop policy if exists attendees_insert on public.attendees;
create policy attendees_insert on public.attendees for insert to authenticated
  with check (public.is_super_admin(auth.uid()));

drop policy if exists attendees_update on public.attendees;
create policy attendees_update on public.attendees for update to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists attendees_delete_super on public.attendees;
create policy attendees_delete_super on public.attendees for delete to authenticated
  using (public.is_super_admin(auth.uid()));

-- fields: everyone reads, super admin configures.
drop policy if exists fields_select on public.fields;
create policy fields_select on public.fields for select to authenticated using (true);

drop policy if exists fields_write on public.fields;
create policy fields_write on public.fields for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- check-ins: staff read all and write; the triggers below police the details.
drop policy if exists status_select on public.attendee_field_status;
create policy status_select on public.attendee_field_status for select to authenticated using (true);

drop policy if exists status_insert on public.attendee_field_status;
create policy status_insert on public.attendee_field_status for insert to authenticated with check (true);

drop policy if exists status_update on public.attendee_field_status;
create policy status_update on public.attendee_field_status for update to authenticated using (true) with check (true);

drop policy if exists status_delete_super on public.attendee_field_status;
create policy status_delete_super on public.attendee_field_status for delete to authenticated
  using (public.is_super_admin(auth.uid()));

-- user_field_access: you see your own grants; super admin manages all.
drop policy if exists ufa_select on public.user_field_access;
create policy ufa_select on public.user_field_access for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists ufa_write on public.user_field_access;
create policy ufa_write on public.user_field_access for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. BACKEND ENFORCEMENT — the south rule, not just a UI convention.
-- Named to sort first so it fires before the existing rules trigger.
-- ---------------------------------------------------------------------------
create or replace function public.block_pre_collected_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.attendees a
             where a.id = new.attendee_id and a.pre_collected) then
    raise exception 'This attendee already collected in a previous distribution (batch: %)',
      (select batch from public.attendees where id = new.attendee_id)
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists aa_block_pre_collected on public.attendee_field_status;
create trigger aa_block_pre_collected
  before insert or update on public.attendee_field_status
  for each row execute function public.block_pre_collected_status();

-- Quantity must be present and sane. The column is nullable smallint, so a
-- NULL currently slips past every check in the older trigger.
alter table public.attendee_field_status
  alter column quantity set default 1;
update public.attendee_field_status set quantity = 1 where quantity is null;
alter table public.attendee_field_status
  alter column quantity set not null;

-- ---------------------------------------------------------------------------
-- 3. INDEXES — matched to the queries the dashboard actually issues
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists idx_attendees_active
  on public.attendees (pre_collected, batch);
create index if not exists idx_attendees_gov      on public.attendees (governorate);
create index if not exists idx_attendees_district on public.attendees (district);
create index if not exists idx_attendees_area     on public.attendees (area);
create index if not exists idx_attendees_name_trgm
  on public.attendees using gin (name gin_trgm_ops);
create index if not exists idx_attendees_record_trgm
  on public.attendees using gin (record_number gin_trgm_ops);
create index if not exists idx_attendees_phone_trgm
  on public.attendees using gin (phone gin_trgm_ops);

create index if not exists idx_status_field_checked
  on public.attendee_field_status (field_id) where checked_at is not null;
create index if not exists idx_status_attendee
  on public.attendee_field_status (attendee_id);

-- ---------------------------------------------------------------------------
-- 4. AGGREGATE RPCs — one round trip instead of N+1
-- ---------------------------------------------------------------------------

-- Stats page: was 1 + (1 per field) queries, re-run on EVERY realtime event.
create or replace function public.stats_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active_attendees',   (select count(*)                    from public.attendees where not pre_collected),
    'active_children',    (select coalesce(sum(quantity),0)   from public.attendees where not pre_collected),
    'south_attendees',    (select count(*)                    from public.attendees where pre_collected),
    'south_children',     (select coalesce(sum(quantity),0)   from public.attendees where pre_collected),
    'fields', (
      select coalesce(jsonb_agg(t.obj order by t.sort_order), '[]'::jsonb)
      from (
        select f.sort_order,
               jsonb_build_object(
                 'id',   f.id,
                 'name', f.name,
                 'checked_attendees',
                   count(*) filter (where s.checked_at is not null),
                 'checked_quantity',
                   coalesce(sum(s.quantity) filter (where s.checked_at is not null), 0)
               ) as obj
        from public.fields f
        left join public.attendee_field_status s on s.field_id = f.id
        left join public.attendees a on a.id = s.attendee_id and not a.pre_collected
        where f.is_enabled
        group by f.id, f.name, f.sort_order
      ) t
    )
  );
$$;

-- Filter dropdowns: was pulling every attendee row just to derive 3 lists.
create or replace function public.attendee_filter_options()
returns table (governorate text, district text, area text)
language sql stable security definer set search_path = public as $$
  select distinct a.governorate, a.district, a.area
  from public.attendees a
  order by 1, 2, 3;
$$;

revoke all on function public.stats_summary()           from public, anon;
revoke all on function public.attendee_filter_options() from public, anon;
grant execute on function public.stats_summary()           to authenticated;
grant execute on function public.attendee_filter_options() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------
select tablename, rowsecurity as rls_on
from pg_tables where schemaname = 'public' order by tablename;

-- ---------------------------------------------------------------------------
-- 6. SEARCH RPC — the whole attendees screen in ONE round trip.
-- Replaces: 1 paged attendees query + 1 status query + client-side filtering
-- that silently broke pagination counts.
-- ---------------------------------------------------------------------------
create or replace function public.search_attendees(
  p_query       text  default null,
  p_governorate text  default null,
  p_district    text  default null,
  p_area        text  default null,
  p_batch       text  default 'active',   -- 'active' | 'south' | 'all'
  p_field_id    uuid  default null,
  p_field_state text  default 'any',      -- 'any' | 'checked' | 'not_checked'
  p_sort        text  default 'name',
  p_dir         text  default 'asc',
  p_limit       int   default 50,
  p_offset      int   default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_sort text;
  v_dir  text;
  v_sql  text;
  v_out  jsonb;
begin
  -- Whitelist: these two are interpolated, never the user's raw text.
  v_sort := case p_sort
              when 'record_number' then 'a.record_number'
              when 'governorate'   then 'a.governorate'
              when 'district'      then 'a.district'
              when 'area'          then 'a.area'
              when 'quantity'      then 'a.quantity'
              else 'a.name'
            end;
  v_dir  := case when lower(coalesce(p_dir,'asc')) = 'desc' then 'desc' else 'asc' end;

  v_sql := format($q$
    with filtered as (
      select a.* from public.attendees a
      where ($1 = 'all'
             or ($1 = 'active' and not a.pre_collected)
             or ($1 = 'south'  and a.pre_collected))
        and ($2 is null or a.governorate = $2)
        and ($3 is null or a.district    = $3)
        and ($4 is null or a.area        = $4)
        and ($5 is null or $5 = ''
             or a.name          ilike '%%'||$5||'%%'
             or a.record_number ilike '%%'||$5||'%%'
             or coalesce(a.phone,'') ilike '%%'||$5||'%%')
        and ($6 is null or $7 = 'any'
             or ($7 = 'checked' and exists (
                   select 1 from public.attendee_field_status s
                   where s.attendee_id = a.id and s.field_id = $6 and s.checked_at is not null))
             or ($7 = 'not_checked' and not exists (
                   select 1 from public.attendee_field_status s
                   where s.attendee_id = a.id and s.field_id = $6 and s.checked_at is not null)))
    ),
    page as (
      select a.* from filtered a order by %s %s, a.id limit $8 offset $9
    ),
    ordered as (select p.*, row_number() over () as rn from page p)
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'name', o.name, 'record_number', o.record_number,
                 'governorate', o.governorate, 'district', o.district, 'area', o.area,
                 'phone', o.phone, 'quantity', o.quantity, 'age', o.age,
                 'batch', o.batch, 'pre_collected', o.pre_collected,
                 'statuses', coalesce((
                   select jsonb_object_agg(s.field_id::text, jsonb_build_object(
                            'checked_at', s.checked_at, 'quantity', s.quantity))
                   from public.attendee_field_status s where s.attendee_id = o.id
                 ), '{}'::jsonb)
               ) order by o.rn)
        from ordered o), '[]'::jsonb)
    )
  $q$, v_sort, v_dir);

  execute v_sql into v_out
    using p_batch, p_governorate, p_district, p_area, p_query,
          p_field_id, p_field_state, p_limit, p_offset;

  return v_out;
end $fn$;

revoke all on function public.search_attendees(text,text,text,text,text,uuid,text,text,text,int,int) from public, anon;
grant execute on function public.search_attendees(text,text,text,text,text,uuid,text,text,text,int,int) to authenticated;
