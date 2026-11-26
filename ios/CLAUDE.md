# OfficeTruck Driver (iOS)

Native driver app: Swift 6, SwiftUI, iOS 17+. Backend is the shared Supabase project (`../supabase`).

## Setup
1. `cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig` and fill in the host and publishable key from `web/.env.local`. The file is git-ignored.
2. Open `OfficeTruckDriver.xcodeproj`. The project is generated from `project.yml` by XcodeGen, so edit `project.yml` (not the project's settings in Xcode) and run `xcodegen` after adding or removing files.
3. Command-line build: `xcodebuild -project OfficeTruckDriver.xcodeproj -scheme OfficeTruckDriver -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath build/DerivedData build`

## Conventions
- Build UI from stock SwiftUI only (`List`, `Section`, `LabeledContent`, `Label`, `Button` with system styles, `.alert`, `.sheet`, `ContentUnavailableView`, `ProgressView`). Don't create custom component views (badges, wrapper or styled row views); write the UI inline in each screen. One exception: the sign-in screen plays `Resources/Cargo.json` with the Lottie package (`LottieView`).
- SwiftUI and the Observation framework (`@Observable`, `@State`, `@Environment`). Don't use `ObservableObject` or Combine unless an API forces it.
- async/await for all I/O. Keep UI state on `@MainActor`.
- Talk to Supabase with the `supabase-swift` SPM package. Use the publishable (anon) key only; never ship the service-role key.
- Drivers sign in with phone OTP, then call the `claim_driver_logins()` RPC.
- Read driver data only through driver-scoped RPCs and RLS. Never decode or show load rates, `load_charges`, invoices or broker pay.
- Layout: `OfficeTruckDriver/App`, `Features/{Auth,Load,Trips,Pay,Me}`, `Core` (Supabase client, `DriverAPI`, models, offline queue).
- Stop and appointment times are wall-clock strings at the stop. Show them as written (`WallClock`); never convert them to the phone's time zone.
- Profile: drivers send a new CDL or medical card (`submit_my_driver_update`; nothing on the driver changes until an owner or admin accepts it on the web) and see their DQ file (`my_dq_file`, uploads with `add_my_dq_document`). DQ item status is worked out in the app like `web/lib/dq-rules.ts`.
- One screen, no tab bar: Trips is the root (Pay and Profile open as pages from its top-right toolbar). It groups loads as Today (in transit, dispatched with pickup today or overdue, delivered today), Upcoming (dispatched, pickup on a later day) and Past (the rest, newest first), comparing pickup days as written. Tapping a trip opens the load: Check in / Check out is the bottom primary button. Below the stops: Paperwork (one row each for BOL and POD: tap to add; once added, a checkmark, tap to view, and swipe left for View, Upload again or Remove; then lumper receipts and other) and Expenses (Add expense, `add_my_expense`, through the offline queue; swipe left to view the receipt or remove one the driver added, `remove_my_expense`, which the server refuses once a paid pay statement covers the load). The load's details and dispatch's notes open from the (i) toolbar button, so the driver's actions come first.
- UI for drivers: big tap targets (≥ 44pt, prefer 56pt for primary actions), high contrast, Dynamic Type, system light/dark mode.
- Check in / Check out saves where the phone is (`CheckInLocation`, When In Use only, running only while a load that can be checked in is on screen) with the stop, for detention. No permission or no fix: the check-in still goes.
- Writes made with no signal (stop check-ins, document uploads, expenses) go through the offline queue and retry later.
- Verify in the iOS Simulator on the latest iOS 26 runtime (iPhone 17 Pro): build, launch, take a screenshot and tap through the flow.
- Demo mode (Debug builds): launch with `-demo` (`xcrun simctl launch <device> com.officetruck.driver -demo`) to sign in with sample data from `Core/DemoBackend.swift`, with no SMS or server. Add `-two-carriers` to see a driver who drives for two companies, or `-signed-out` to start at sign-in (no text is sent; any 6-digit code signs in).
