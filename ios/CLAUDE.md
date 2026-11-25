# OfficeTruck Driver (iOS)

Native driver app: Swift 6, SwiftUI, iOS 17+. Backend is the shared Supabase project (`../supabase`).

## Conventions
- SwiftUI and the Observation framework (`@Observable`, `@State`, `@Environment`). Don't use `ObservableObject` or Combine unless an API forces it.
- async/await for all I/O. Keep UI state on `@MainActor`.
- Talk to Supabase with the `supabase-swift` SPM package. Use the publishable (anon) key only; never ship the service-role key.
- Drivers sign in with phone OTP, then call the `claim_driver_logins()` RPC.
- Read driver data only through driver-scoped RPCs and RLS. Never decode or show load rates, `load_charges`, invoices or broker pay.
- Layout: `App/`, `Features/{Auth,Load,Trips,Pay,Me}`, `Core/{SupabaseClient,Models,OfflineQueue}`.
- Tabs: Load, Trips, Pay, Me.
- UI for drivers: big tap targets (≥ 44pt, prefer 56pt for primary actions), high contrast, Dynamic Type, system light/dark mode.
- Writes made with no signal (stop check-ins, document uploads, expenses) go through the offline queue and retry later.
- Verify in the iOS Simulator: build, launch, take a screenshot and tap through the flow.
