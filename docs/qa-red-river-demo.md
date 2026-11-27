# QA pass: Red River Freight demo company (2026-11-27)

A full run of the app as a fake trucking company, with bugs, gaps and ideas to
work through. Written so several sessions can pick up pieces without
re-discovering context. **When you finish an item, tick it here and note the
branch or PR.**

## Where things stand

- **2026-11-28:** bugs and gaps below fixed on branch `claude/qa-fixes` (from `dev`). Its two migrations are applied to the hosted project. Ideas are still open. Demo data change: Kim was assigned PPT-55410 (Dec 3) to show the missing medical card warning.

- Branch `claude/ifta` (from `dev`) holds **uncommitted** work: the IFTA page,
  CSV import, fuel gallons/state on load expenses, trailer dates in the
  dashboard To do. Commit or check it out before building on it.
- Two migrations from that work are **already applied** to the hosted
  Supabase project (`dplwsjxndijzfzdweugx`):
  `20261127220859_ifta.sql`, `20261127222019_fuel_expense_gallons.sql`.
  Deploy order matters: apply them before shipping the web code, or the
  dashboard crashes (it queries `ifta_state_miles` / `ifta_filings`).
- The hosted project also holds the orgs `acme` (QA data) and `production`
  ("Real Trucking"). Never write test data there.

## The demo company

Org `red-river-freight-llc` ("Red River Freight LLC"), id
`493a9b8c-b190-4eae-b07a-32be8f77a2b4`, owned by the developer account
(`13608552-c74e-4fc7-b23a-9329dfb48fac`). Company time zone America/Chicago.
All emails use `.example` domains; phones are fake 555 numbers; DOT 3987412,
MC 1498823 (fake). Every PDF is marked "SAMPLE - NOT A REAL DOCUMENT".

### Drivers

| Driver | Status | Pay | Login | Seeded problem |
|---|---|---|---|---|
| Marcus Hill | active | $0.62/mi | yes, auth id `a1000000-0000-4000-8000-000000000171` | created through the real Add Driver form |
| Dana Ortiz | active | $0.60/mi | no | medical card expires 2026-12-09 |
| Terrell Banks | active | 28% | yes, `…000000000173` | CDL was due 2027-01-05; sent a renewal from the app, office accepted it |
| Kim Nguyen | active | $0.58/mi | yes, `…000000000174` | **no medical card on file**, but drove SLL-40790 |
| Ray Castillo | active | 88% (owner-operator) | no | his truck 104 is out of service |
| Earl Whitfield | inactive | $0.55/mi | no | retired, expired CDL/med card |

None of the drivers has a qualification (DQ) file set up.

### Equipment and customers

- Trucks: 101 (Marcus), 102 (Dana), 103 (Terrell, registration and plate
  expire 2026-12-10), 104 (Ray, out of service until 2026-12-01, turbo).
  Odometers were updated by driver check-ins.
- Trailers: 5301, 5302 (registration and plate expired 2026-11-20, annual
  inspection due 2026-11-28), 5303 reefer, 4801 flatbed.
- Customers: Summit Line Logistics LLC (net 30), Bluebonnet Freight Brokerage
  Inc (net 21), Prairie Path Transport Services (net 45, invoices by portal),
  Ozark Valley Foods (direct shipper).

### Loads (15)

| Load | Status | Notes |
|---|---|---|
| SLL-40112, BFB-88310, OVF-1042, OVF-1077 | paid | invoices 1001, 1002, 1004, 1007 |
| PPT-55021 | invoiced | invoice 1003, sent Oct 3 by portal, **overdue** |
| SLL-40398 | invoiced | invoice 1005, $1,000 of $2,250 paid, detention charge |
| BFB-88761 | invoiced | invoice 1006, 1 day overdue |
| SLL-40655 | delivered | 3 stops, **no POD**, ready to invoice |
| SLL-40790 | delivered | Kim checked in/out and uploaded BOL + POD from the driver side today |
| SLL-40810 | in transit | Marcus checked in/out at pickup (GPS + odometer), uploaded BOL, added a $436.85 out-of-pocket fuel receipt (office then set 118.42 gal, AR) |
| OVF-1101 | dispatched | Terrell arrived at pickup 5:40am and hasn't left: **in detention** ($75/hr) + $185 lumper receipt |
| PPT-55377 | TONU | marked TONU $250 through the UI; draft invoice 1008 shows the bug below |
| BFB-89002 | cancelled | cancelled through the UI |
| BFB-89140 | dispatched | Dana, Dec 1 |
| PPT-55410 | booked | unassigned, Dec 3 |

Past loads' stop times were entered as the office (`set_stop_time`), since
drivers can't check in more than 24 hours back. Invoice dates were corrected
directly in the database to their real sent dates (see bug 3 / idea 1).

### Other data

- Company documents: insurance (expires 2026-12-20), operating authority,
  W-9, IFTA license, all uploaded through the Documents page.
- Marcus's Sep 14–20 pay statement is marked paid; the driver sees it in
  `my_settlements()`.
- IFTA Q4 2026: 17 miles rows (trucks 101–103) and 14 fuel purchases imported
  from CSV, plus Marcus's load fuel. Fleet MPG 5.11. Q3 isn't marked filed.

## How to act as a driver (for testing)

Run SQL as the driver so RLS and the driver RPCs apply:

```sql
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000171","role":"authenticated"}', true);
select public.my_loads();
-- record_my_stop_event(stop, 'arrived'|'departed', tapped_at, odometer, lat, lng, accuracy)
-- add_my_load_document(load, kind, path, file_name, content_type, size)
-- add_my_expense(load, kind, amount, spent_on, note, receipt_path, …, paid_by)
```

Use the office account the same way with
`13608552-c74e-4fc7-b23a-9329dfb48fac`. Driver uploads need the file in
storage first: `add_my_load_document` checks `storage.objects`. In this pass
the office put files in the load folder and the driver registered them, so
**the drivers' own storage upload policy wasn't exercised**.

## What worked

- Driver flow end to end: check-ins with GPS and odometer, BOL/POD uploads,
  receipts, CDL renewal → office review → accept.
- Driver boundary: `my_load` returns `rate: null` and no charges; as a driver,
  `loads`, `load_charges`, `invoices`, `drivers` and `brokers` return 0 rows.
  Checking in on another driver's load, or more than a day back, is refused
  with clear messages.
- Detention "On the clock" card; loads moving to Delivered on their own from
  stop times and the POD; odometers flowing to trucks.
- Invoices, payments, TONU and cancel dialogs, pay statements, IFTA imports,
  load fuel on IFTA, per-truck miles check. No new server errors on any page.

## Bugs

- [x] **1. TONU still bills the linehaul (serious).** Fixed on branch `claude/qa-fixes`: migration `20261127230124_tonu_bills_tonu_only` drops the rate con charges when a load becomes TONU and puts them back on reopen; `loadDriverPay` pays nothing on a TONU. PPT-55377 now bills $250. A flat TONU pay for drivers is still an idea below. PPT-55377 marked TONU
  for $250: revenue becomes $1,550 and draft invoice 1008 bills Linehaul
  $1,300 + TONU $250. The load also keeps the driver's per-mile pay ($180) for
  miles never driven. Expected: a TONU load bills only the TONU charge (and
  any other non-linehaul charges the user keeps), and driver pay is zero or a
  flat TONU amount. Look at the TONU action in `web/app/org/[slug]/loads/`
  and the rate version / charges logic; check reopening a TONU restores the
  linehaul.
- [x] **2. Missing compliance dates aren't flagged anywhere.** Fixed on branch `claude/qa-fixes`: red "No medical card" / "No CDL" badge in the drivers list, and a To do item for a driver with a load on their schedule. Kim has no
  medical card and drove today; the drivers list shows grey "1 of 4 dates on
  file" and the dashboard To do is silent (missing dates were only on the
  removed Compliance page). At minimum: red warning in the drivers/trucks
  lists, and a To do item for a missing CDL or medical card on a driver with
  a load in the next few days.
- [x] **3. A payment can be dated before its invoice.** Fixed on branch `claude/qa-fixes`: migration `20261127230125_payment_date_checks` refuses dates before the invoice date or in the future; the payment date picker is limited to that range.
  `record_invoice_payment` accepted a paid date weeks before `invoice_date`.
  Validate in the RPC and the payment form.
- [x] **4. Stops get no time zone unless created through the New Load page.** Not an app bug: both app paths (New Load, Edit stops) call `fillStopTimeZones`; only loads created straight through SQL miss it, and a stop Google can't place counts detention from arrival by design. No change.
  `create_load` leaves `load_stops.time_zone` null; the page calls
  `set_stop_time_zone` afterwards. Loads from the rate con inbox, imports or
  RPCs would show out-of-state times in Central. Set it in the database (or in
  every path that creates stops).
- [x] **5. Small fixes.** All done on branch `claude/qa-fixes` (CDL label, possessive via `lib/text-format.ts`, IFTA toast counts states and trucks, load link before the note, compliance column `min-w-60` on trucks and trailers, stats strip 4 columns from `xl`).
  - Driver page update card says "New cdl" (should be "New CDL").
  - Invoice next step: "Prairie Path Transport Services's portal".
  - IFTA miles import toast says "17 states" for 17 truck/state rows.
  - IFTA fuel row for load fuel: "Load SLL-40810" link cut off by a long note.
  - Trucks table Compliance column clipped at 1440px wide.
  - Dashboard stat titles truncate in a ~1000px window ("Revenue th…").

## Gaps

All fixed on branch `claude/qa-fixes` unless noted.


- [x] Dashboard To do doesn't show a driver document waiting for review
  (Terrell's CDL sat unnoticed until the driver page was opened).
- [x] No flag for a stale load: PPT-55377 stayed "Dispatched" a week past
  pickup with no check-ins.
- [x] SLL-40790 (delivered today, POD in) isn't listed in To do as ready to
  invoice. (It was hidden by the missing rate con; now listed, naming what's missing.)
- [x] Drivers list shows Ray "Available" though his only truck is out of
  service.
- [x] Driver page "Next action" says "Picks up Nov 27" for Terrell, who's been
  at the dock in detention since 5:40am.
- [x] Nothing prompts setting up a driver's qualification file; (seeding artifact: saving a start date builds the file, and a missing start date is already a next step) every driver
  shows "Not set up".
- [x] The IFTA reminder fires for the previous quarter (Q3, "overdue") as soon
  as a company starts using IFTA, even if they filed it elsewhere. Consider
  only reminding for quarters from first use onward, or a one-time "Did you
  file Q3?" prompt.

## Ideas

Still open. Also new: TONU revenue isn't in Reports (they count delivered loads only).


- [ ] **Import past invoices with their real dates.** `send_invoice` only
  takes a date within a day of today, so a carrier switching to the app can't
  bring in history. An "add a past invoice" path (set invoice date and paid
  status) would help onboarding.
- [ ] **TONU pay rule:** flat TONU pay for the driver, set per company or per
  driver.
- [ ] **Compliance blockers on the dashboard:** missing or expired documents
  only for drivers and trucks with a load in the next 7 days.
- [ ] **Live driver state** on the Drivers/Trucks lists and the load's next
  step: "At pickup since 5:40", "In detention", "Delivered, POD in".
- [ ] **Gallons and state in the driver app** fuel receipt (proposed as a
  separate task: update `add_my_expense`, then the iOS form; needs
  `claude/ifta` merged first).
- [ ] Before deploying `claude/ifta`, apply its two migrations first (see top).

## Cleanup when done

The demo org, its files in storage (`load-documents`, `driver-documents`,
company documents), and the three auth users
(`a1000000-0000-4000-8000-00000000017{1,3,4}`) are still in the hosted
project. Delete them only when the user says so. Deleting the org cascades
most rows; storage objects and `auth.users` rows need removing separately.
