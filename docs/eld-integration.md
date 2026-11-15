# Adding an ELD integration

What to build when OfficeTruck connects to an ELD (Motive first, Samsara
later), so miles, stop times and IFTA come from the truck instead of from
estimates and taps.

## Where things stand today

| What | How it's filled in now | What the ELD should replace it with |
| --- | --- | --- |
| Loaded miles (`loads.miles`) | **Estimated** with the Google Maps Routes API through the stops (`lib/route-miles.ts`), on New Load and whenever a load's stops are saved | Actual miles from the odometer, first pickup to last delivery |
| Empty miles (`loads.empty_miles`) | **Estimated** from the truck's last delivery before the load, or its home base, to the first pickup (`lib/empty-miles.ts`) | Actual miles from the previous load's last stop to this load's first pickup |
| Arrived / departed at a stop (`load_stops.arrived_at`, `departed_at`) | The driver taps on their dispatch page, or the office enters a time. `arrived_source` / `departed_source` already allow `'eld'` | Geofence arrival and departure from the truck's GPS, stamped with source `'eld'` |
| Truck ↔ ELD link | `trucks.motive_vehicle_id` (on the truck form's ELD card) | Same field, plus a provider column when a second ELD is added |
| Miles by state for IFTA | Not tracked | Pulled from the ELD each quarter |
| Driver pay per mile | Locked at assignment on the **estimated** loaded miles | Decide: keep paying on estimated ("dispatched") miles, or switch to actual (see below) |

Google routes for a car, so estimates usually run a little short of a
truck's real route. Keep the estimates even after the ELD is connected:
they're what you quote and plan on before the load runs.

## What to build

### 1. Connect the account

- Motive: register an OAuth app (or use an API key for a single company)
  at the Motive developer portal. Samsara: an API token from the Samsara
  dashboard.
- New table `eld_connections`: `organization_id`, `provider`
  (`'motive' | 'samsara'`), encrypted tokens, `connected_at`,
  `last_synced_at`, `status`. One row per organization per provider.
- A Settings page to connect, show the status and last sync, and
  disconnect. Tokens stay on the server only, like every other key
  (never `NEXT_PUBLIC_`).

### 2. Link trucks

- `trucks.motive_vehicle_id` is already there. When Samsara is added,
  rename the idea to `eld_provider` + `eld_vehicle_id` so a truck links to
  one ELD.
- After connecting, offer to match trucks automatically by VIN (both ELDs
  return it), then let the person confirm.

### 3. Store the real numbers next to the estimates

Don't overwrite the estimates; keep both, so you can compare and so pay
stays explainable.

- `loads.actual_miles` and `loads.actual_empty_miles` (integers, nullable).
- `loads.miles_source`: `'estimate' | 'eld' | 'manual'` for what reports
  should use.
- `load_stops.arrived_odometer` and `load_stops.departed_odometer`
  (numeric, nullable), filled from the ELD at the matching times.
- `truck_state_miles`: `truck_id`, `month`, `state`, `miles`, for IFTA.

### 4. Sync

- A scheduled job (Supabase cron or a Vercel cron route) every 5 to 15
  minutes: pull vehicle locations and odometer readings for linked trucks
  on active loads (dispatched or loaded).
- Use the ELD's webhooks where available (Motive has them for vehicle
  location and geofence events) so arrivals land within a minute.
- Respect rate limits; back off and retry. A failed sync must never block
  the driver's taps or the office: they keep working as they do today.

### 5. Turn readings into miles and stop times

- **Arrived / departed:** when the truck enters a geofence (about 0.25
  miles) around a stop and stays, stamp arrival through `stamp_stop_time`
  with source `'eld'`; leaving stamps departure. Stop addresses need
  coordinates for this: geocode them once when stops are saved (Google
  Geocoding) and store `load_stops.latitude` / `longitude`.
  The driver's tap still wins if it comes first; the office can correct
  either. Detention then runs off ELD times, which brokers accept more
  readily than taps.
- **Actual loaded miles** = odometer when departing the last delivery −
  odometer when arriving at the first pickup.
- **Actual empty miles** = odometer at this load's first pickup arrival −
  odometer when the truck left its previous load's last stop.
- Set `miles_source = 'eld'` once both readings exist. Show
  "Estimated 742 · Actual 768" on the load page.

### 6. IFTA

- Each month, pull miles by state per truck into `truck_state_miles`.
- Fuel purchases by state come from load expenses (fuel receipts) or a
  fuel card import.
- A quarterly IFTA page: miles and gallons by state, ready to file.

### 7. Decide how drivers are paid

Most small carriers pay per-mile drivers on **dispatched (estimated)
miles**, locked when the load is assigned, so pay doesn't change after the
trip. Some pay on actual miles. Pick one and say so on the load:

- Keep dispatched miles (today's behavior): nothing changes; actual miles
  are for fuel, maintenance and IFTA.
- Pay on actual miles: recompute `loadDriverPay` from `actual_miles` once
  the load is delivered, and show the change before payroll.

## Rollout checklist

- [ ] ELD developer account and API access
- [ ] `eld_connections` table and Settings page to connect
- [ ] Trucks matched to ELD vehicles (by VIN, confirmed)
- [ ] Migration: actual miles, miles source, stop odometers, stop
      coordinates, state miles
- [ ] Sync job and webhooks, with retries and a visible last-sync time
- [ ] Geofence arrival/departure stamping with source `'eld'`
- [ ] Load page shows estimated vs actual miles
- [ ] Reports (rate per mile, deadhead %) use actual miles when present
- [ ] IFTA quarterly report
- [ ] Driver pay rule decided and documented
- [ ] Test with one truck for a week before turning it on for all
