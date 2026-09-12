# Event day runbook

State as of the night before: **907 families / 1605 children** loaded as the
`main` list, plus **168 families / 289 children** on `south_2026` which are
locked (already collected). Zero check-ins recorded — clean slate.

## Accounts and stations

Each account reaches exactly one station. Roles were verified the night before
and all 15 are correct; nobody is sitting on "no station".

| Station | Accounts |
|---|---|
| Main entrance | `reception@lot.com`, `reception1/2/3@lot.com` |
| Stationary and Backpacks | `stat@lot.com`, `stat1/2/3@lot.com` |
| Dental Check (USJ) | `admin@usj.com` |
| Medical test (LAU) | `admin@laumc.com` |
| Optic et vision | `admin@ov.com` |
| LG Sealco | `admin@sealco.com` |
| Bey 1 | `admin@bey1.com` |
| Everything + undo/reset/export | `ryan@notqwerty.com`, `simon.taouk2@hotmail.com` |

## The rules the database enforces

These are enforced server-side, so they hold no matter what anyone taps:

1. **Main entrance first.** No other station can be checked until main entrance
   is done for that family.
2. **One winner per station.** If two operators tap the same station for the
   same family at once, exactly one write lands. The loser is told who got
   there first and at what time.
3. **Quantity never exceeds the family's registered child count** — super
   admins included.
4. **Only a super admin can undo** a check-in.
5. **South families are locked** for everyone.

## If something goes wrong

**"Check this family in at the Main entrance first"** — working as intended.
Send them to the door first.

**"This station is not assigned to your account"** — they are signed into the
wrong account for that table.

**A station button looks stuck / grey after a tap** — the screen now updates
from the server's own reply, so this should not happen. If it does, change a
filter and change it back to force a refetch.

**Wifi drops** — the banner appears. Work stops until it returns; when it does,
the list refetches automatically. Anything tapped while offline was **not**
saved and must be re-tapped. There is no offline queue (see Known gaps).

**A family's registered child count is wrong** — there is no in-app way to
change it. A super admin has to fix `attendees.quantity` in the Supabase table
editor; the check-in screen will then allow the new number.

**Search returns several families for a record number** — expected. Record
numbers repeat (166 values are shared, one by 14 families). Search by **phone
or name** to disambiguate.

## Super admin tasks

- **Export** — Super Admin → Export Data. Downloads two CSVs (roster and full
  check-in history with timestamps).
- **Reset between runs** — Super Admin → Complete Reset. It exports a backup
  first and makes you confirm the backup opened before it will proceed.
- **Add an account** — new sign-ups now land with **no station** and can check
  nobody in. Assign them in Super Admin → Users & Roles; they appear under the
  amber "no station yet" banner.

## Known gaps, deliberately not changed the night before

- **No offline queue.** A tap made with no connection is lost, not queued. This
  is the one worth building before the next event; it was too large a change to
  land safely hours before this one.
- **No in-app edit of a family's details** (name, phone, child count).
- Two wasted search round trips when a filter changes while paginated past
  page 1, and the request-cancellation plumbing is not actually wired to the
  network call. Harmless, just extra load.
- `supabase/schema.sql` is older than the migrations and would loosen RLS if
  re-run on a live database. Treat the numbered migrations as the source of
  truth; do not run `schema.sql` against production.
