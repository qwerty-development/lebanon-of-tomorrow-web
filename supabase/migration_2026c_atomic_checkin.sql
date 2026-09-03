-- ============================================================================
-- 2026c — atomic check-in + ordering fix
--   1. checked_by: who claimed a station, for the "already collected" message
--   2. check_in_field(): ONE writer wins, always. Fixes the double-hand-out
--      race when several staff work the same attendee simultaneously.
--   3. undo_check_in(): super-admin only reversal
--   4. search_attendees: stable secondary ordering (blanks last)
-- ============================================================================

-- 1. Who performed the check-in ----------------------------------------------
alter table public.attendee_field_status
  add column if not exists checked_by uuid references public.profiles(id);

-- 2. Atomic claim -------------------------------------------------------------
-- The WHERE on DO UPDATE is the whole point: it only fires when the existing
-- row is still unclaimed. A second concurrent writer updates nothing, gets no
-- row back, and is told who got there first. Postgres serialises the two
-- statements on the primary key, so there is no window between them.
create or replace function public.check_in_field(
  p_attendee_id uuid,
  p_field_id    uuid,
  p_quantity    int default 1
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row     public.attendee_field_status;
  v_claimed boolean := false;
  v_email   text;
begin
  insert into public.attendee_field_status (attendee_id, field_id, checked_at, quantity, checked_by)
  values (p_attendee_id, p_field_id, now(), greatest(coalesce(p_quantity, 1), 1), auth.uid())
  on conflict (attendee_id, field_id) do update
     set checked_at = now(),
         quantity   = greatest(coalesce(p_quantity, 1), 1),
         checked_by = auth.uid()
   where attendee_field_status.checked_at is null
  returning * into v_row;

  if found then
    v_claimed := true;
  else
    -- Lost the race (or it was already checked). Report the winner.
    select * into v_row
    from public.attendee_field_status
    where attendee_id = p_attendee_id and field_id = p_field_id;
  end if;

  select p.email into v_email from public.profiles p where p.id = v_row.checked_by;

  return jsonb_build_object(
    'claimed',          v_claimed,
    'checked_at',       v_row.checked_at,
    'quantity',         v_row.quantity,
    'checked_by',       v_row.checked_by,
    'checked_by_email', v_email
  );
end $$;

revoke all on function public.check_in_field(uuid, uuid, int) from public, anon;
grant execute on function public.check_in_field(uuid, uuid, int) to authenticated;

-- 3. Reversal, super admin only ----------------------------------------------
create or replace function public.undo_check_in(p_attendee_id uuid, p_field_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only super admins can undo a check-in';
  end if;
  update public.attendee_field_status
     set checked_at = null, quantity = 1, checked_by = null
   where attendee_id = p_attendee_id and field_id = p_field_id;
end $$;

revoke all on function public.undo_check_in(uuid, uuid) from public, anon;
grant execute on function public.undo_check_in(uuid, uuid) to authenticated;

-- 4. search_attendees: deterministic ordering ---------------------------------
-- Sorting by district/area used to leave a big block of identical values in
-- random (uuid) order, so the page looked unsorted. Secondary sort by name,
-- and push blank districts/areas to the end instead of the top.
create or replace function public.search_attendees(
  p_query       text    default null,
  p_patterns    text[]  default null,
  p_governorate text    default null,
  p_district    text    default null,
  p_area        text    default null,
  p_batch       text    default 'active',
  p_field_id    uuid    default null,
  p_field_state text    default 'any',
  p_sort        text    default 'name',
  p_dir         text    default 'asc',
  p_limit       int     default 50,
  p_offset      int     default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_col   text;
  v_dir   text;
  v_order text;
  v_sql   text;
  v_out   jsonb;
begin
  v_col := case p_sort
             when 'record_number' then 'a.record_number'
             when 'governorate'   then 'a.governorate'
             when 'district'      then 'a.district'
             when 'area'          then 'a.area'
             when 'quantity'      then 'a.quantity'
             else 'a.name'
           end;
  v_dir := case when lower(coalesce(p_dir, 'asc')) = 'desc' then 'desc' else 'asc' end;

  if p_sort = 'quantity' then
    v_order := format('a.quantity %s, a.name asc, a.id', v_dir);
  else
    -- nullif() sends '' to NULL so blanks land last in both directions
    v_order := format('nullif(%s, '''') %s nulls last, a.name asc, a.id', v_col, v_dir);
  end if;

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
             or ($10 is not null and (
                    a.name               ilike any($10)
                 or a.record_number      ilike any($10)
                 or coalesce(a.phone,'') ilike any($10)))
             or ($10 is null and (
                    a.name               ilike '%%'||$5||'%%'
                 or a.record_number      ilike '%%'||$5||'%%'
                 or coalesce(a.phone,'') ilike '%%'||$5||'%%')))
        and ($6 is null or $7 = 'any'
             or ($7 = 'checked' and exists (
                   select 1 from public.attendee_field_status s
                   where s.attendee_id = a.id and s.field_id = $6 and s.checked_at is not null))
             or ($7 = 'not_checked' and not exists (
                   select 1 from public.attendee_field_status s
                   where s.attendee_id = a.id and s.field_id = $6 and s.checked_at is not null)))
    ),
    page as (
      select a.*, row_number() over (order by %s) as rn
      from filtered a
      order by %s
      limit $8 offset $9
    )
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
                            'checked_at', s.checked_at,
                            'quantity',   s.quantity,
                            'checked_by', s.checked_by))
                   from public.attendee_field_status s where s.attendee_id = o.id
                 ), '{}'::jsonb)
               ) order by o.rn)
        from page o), '[]'::jsonb)
    )
  $q$, v_order, v_order);

  execute v_sql into v_out
    using p_batch, p_governorate, p_district, p_area, p_query,
          p_field_id, p_field_state, p_limit, p_offset, p_patterns;

  return v_out;
end $fn$;

revoke all on function public.search_attendees(text,text[],text,text,text,text,uuid,text,text,text,int,int) from public, anon;
grant execute on function public.search_attendees(text,text[],text,text,text,text,uuid,text,text,text,int,int) to authenticated;
