-- ============================================================================
-- Follow-up to migration_2026_rls_perf.sql
-- Reconciles the RPCs with the work that came in from origin/main:
--   * stats_summary  -> also returns is_main (the stats cards key off it)
--   * search_attendees -> accepts the generated search patterns as an array
-- Run once, after the first migration.
-- ============================================================================

-- 1. stats_summary: add is_main per field ------------------------------------
create or replace function public.stats_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active_attendees',   (select count(*)                  from public.attendees where not pre_collected),
    'active_children',    (select coalesce(sum(quantity),0) from public.attendees where not pre_collected),
    'south_attendees',    (select count(*)                  from public.attendees where pre_collected),
    'south_children',     (select coalesce(sum(quantity),0) from public.attendees where pre_collected),
    'fields', (
      select coalesce(jsonb_agg(t.obj order by t.sort_order), '[]'::jsonb)
      from (
        select f.sort_order,
               jsonb_build_object(
                 'id',      f.id,
                 'name',    f.name,
                 'is_main', f.is_main,
                 'checked_attendees',
                   count(*) filter (where s.checked_at is not null),
                 'checked_quantity',
                   coalesce(sum(s.quantity) filter (where s.checked_at is not null), 0)
               ) as obj
        from public.fields f
        left join public.attendee_field_status s on s.field_id = f.id
        left join public.attendees a on a.id = s.attendee_id and not a.pre_collected
        where f.is_enabled
        group by f.id, f.name, f.is_main, f.sort_order
      ) t
    )
  );
$$;

revoke all on function public.stats_summary() from public, anon;
grant execute on function public.stats_summary() to authenticated;

-- 2. search_attendees: match against the generated pattern list ---------------
-- The old signature must go, otherwise PostgREST sees two overloads and errors.
drop function if exists public.search_attendees(text,text,text,text,text,uuid,text,text,text,int,int);

create or replace function public.search_attendees(
  p_query       text    default null,
  p_patterns    text[]  default null,   -- from generateSlashPatterns()
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
  v_sort text;
  v_dir  text;
  v_sql  text;
  v_out  jsonb;
begin
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
             -- pattern list when the client sent one ...
             or ($10 is not null and (
                    a.name               ilike any($10)
                 or a.record_number      ilike any($10)
                 or coalesce(a.phone,'') ilike any($10)))
             -- ... plain contains otherwise
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
          p_field_id, p_field_state, p_limit, p_offset, p_patterns;

  return v_out;
end $fn$;

revoke all on function public.search_attendees(text,text[],text,text,text,text,uuid,text,text,text,int,int) from public, anon;
grant execute on function public.search_attendees(text,text[],text,text,text,text,uuid,text,text,text,int,int) to authenticated;
