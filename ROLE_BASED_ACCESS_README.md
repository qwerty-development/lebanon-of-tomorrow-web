# Role-Based Station Access

Every account has exactly one role. The role decides which station that account
can check attendees in at. Enforcement is in the database, so it holds no matter
what the UI does.

## Roles (2026)

### Full access — unchanged
- **`admin`** — can check in at every station
- **`super_admin`** — every station, plus undo/reset, add attendees, and the
  Super Admin panel

### One station each
| Role | Station |
|---|---|
| `main_entrance` | Main entrance |
| `stationary_backpacks` | Stationary and Backpacks |
| `dental_usj` | Dental Check (USJ) |
| `medical_lau` | Medical test (LAU) |
| `optic_et_vision` | Optic et vision |
| `lg_sealco` | LG Sealco |
| `bey_1` | Bey 1 |

### No station
- **`none`** — signed in, can search and view attendees, cannot check anyone in
  anywhere. Where accounts land when their old role is retired.

The 2025 roles `shabebik`, `medical` and `dental` are gone. `medical` and
`dental` accounts carried over to `medical_lau` and `dental_usj` (same station,
new venue); `shabebik` accounts are parked on `none` and have to be reassigned.

## How a role is matched to a station

`public.can_user_modify_field(role, field_name, field_is_main)` matches keywords
against the station **name**, case-insensitively, as substrings. The keyword
lists live in two places and must stay in sync:

- `supabase/schema.sql` — `can_user_modify_field()`
- `lib/roleUtils.ts` — `ROLE_FIELD_PATTERNS`

The database is what actually enforces access; the TypeScript copy only greys
out the buttons an operator cannot use.

Substring matching means renaming a station to
`Dental Check (USJ) - tent 2` keeps working. Renaming it to something with none
of its keywords left **locks its operators out** — either keep a keyword in the
name, or add the new keyword to both lists above.

`main_entrance` is the exception: it also owns whichever station is flagged
`is_main`, whatever that station is called.

### Adding a station next year
A new station needs a new enum value (Postgres cannot add one inside a
transaction that uses it, so do it in its own migration), a keyword list in both
files, and a display name in `ROLE_NAMES` in `lib/roleUtils.ts`.

## Assigning roles

Use **Super Admin → Users & Roles** in the app. It lists every account with a
role picker, shows which stations each role actually reaches (resolved against
the live station list), flags accounts sitting on `none`, and warns you before
you demote your own super-admin account.

It goes through the same super-admin-only RPCs you can call directly:

```sql
-- who exists and what they hold
select * from public.list_all_users();

-- assign
select public.update_user_role('user-uuid-here', 'dental_usj');
```

## Where enforcement happens

1. **Database trigger** — `status_enforce_rules()` on `attendee_field_status`
   (BEFORE INSERT and BEFORE UPDATE) calls `can_user_modify_field()` and raises
   `You do not have permission to modify this field`. This covers the
   `check_in_field()` RPC and any direct write, so it cannot be bypassed from
   the client.
2. **UI** — the attendees page greys the station out with a red border and a
   "role restricted" tooltip, so an operator does not tap a button that is going
   to fail.

Other rules that stack on top, unchanged:
- Main entrance has to be checked before any other station for that attendee.
- Only `super_admin` can uncheck (`undo_check_in`).
- Attendees marked pre-collected are locked for everyone.
- `/dashboard/add` and `/dashboard/admin` are `super_admin` only.

## Debugging

```sql
-- full role x station grid
select * from public.role_field_permissions order by role, field_name;

-- one role
select field_name, can_modify
from public.role_field_permissions
where role = 'dental_usj';

-- one combination
select public.can_user_modify_field('dental_usj', 'Dental Check (USJ)', false);
```

## Migration

Run `supabase/migration_2026d_station_roles.sql`. It is idempotent — running it
twice is harmless.

It **renames** the retired enum values in place and adds the missing ones. It
does not rebuild the type. The obvious approach — create a new enum, re-cast
`profiles.role`, drop the old type — fails on the live database:

```
ERROR: cannot alter type of a column used in a policy definition
DETAIL: policy attendee_field_status_delete on table attendee_field_status
        depends on column "role"
```

RLS policies read `profiles.role`, so the column's type cannot be changed
without dropping and recreating every policy that touches it — including ones
that exist only in the live database and are in no file here. Renaming values
avoids all of it: no policy, view, function or trigger has to be dropped.

The rename carries each account over with its value:

| 2025 | becomes | why |
|---|---|---|
| `medical` | `medical_lau` | same station, new venue |
| `dental` | `dental_usj` | same station, new venue |
| `shabebik` | `none` | retired, no 2026 equivalent — reassign by hand |
| `optic_et_vision` | unchanged | station still exists |
| `admin`, `super_admin` | unchanged | full access |

Do **not** re-run `supabase/migration_role_based_access.sql` afterwards — it is
the 2025 version and would put the retired roles back.

One cosmetic consequence: because values were renamed rather than recreated, the
enum's internal order is `admin, super_admin, none, optic_et_vision,
medical_lau, dental_usj, main_entrance, …` rather than something tidy. That only
affects the order Supabase's own table editor lists them in. The app's role
picker uses `STATION_ROLES` in `lib/roleUtils.ts` and is ordered by station.

### After migrating
Reassign anyone parked on `none`, and anyone whose carried-over station is wrong.
Super Admin → Users & Roles does this in the app, or:

```sql
select id, email, role from public.list_all_users();
select public.update_user_role('<uuid>', 'main_entrance');
```

## Known gaps

- `handle_new_user()` still gives every brand-new auth user `role = 'admin'`,
  i.e. full access until a super admin changes it. Consider defaulting new
  signups to `'none'` if accounts are ever created by anyone but the organisers.
- Roles are an enum, so stations and roles have to be added in lockstep. A
  `fields.required_role` column (or the unused `user_field_access` table) would
  let the super admin wire this up in the app instead of in a migration.
