# OfficeTruck

Trucking office software: a web app for dispatch, plus a native iOS app for drivers. Both share one Supabase backend.

- **`web/`**: Next.js office app. `cd web && npm install && npm run dev`. See [web/README.md](web/README.md).
- **`ios/`**: SwiftUI driver app. Open `ios/` in Xcode.
- **`supabase/`**: migrations, RLS and RPCs shared by both apps.
- **`docs/`**: product and integration notes.

## Deploy

On Vercel, the project's **Root Directory** must be `web`.
