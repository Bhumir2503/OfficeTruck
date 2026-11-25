# OfficeTruck monorepo

| Folder | What | Tooling |
|---|---|---|
| `web/` | Next.js office app (dispatch, loads, fleet, pay) | npm: run commands from `web/` |
| `ios/` | Native driver app (Swift / SwiftUI) | Xcode, iOS 17+ |
| `supabase/` | Shared Postgres schema, RLS, RPCs, migrations: the single backend for both apps | Supabase CLI from the repo root |
| `docs/` | Shared product and integration notes | |

- Schema changes go in `supabase/migrations/`, never in `web/` or `ios/`.
- Drivers sign in with phone OTP and reach data only through driver-scoped RLS and RPCs. Never expose load rates or charges to the driver app.
- Read the folder's own CLAUDE.md before working there (`web/CLAUDE.md`, `ios/CLAUDE.md`).
