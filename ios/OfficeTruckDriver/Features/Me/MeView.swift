import QuickLook
import Supabase
import SwiftUI

/// The driver's profile, opened from Trips: who they are; their CDL and
/// medical card, with a warning before either runs out and a way to send a
/// new one; their DQ file; their truck and how they're paid.
struct MeView: View {
    @Environment(SessionModel.self) private var session
    @State private var profiles: Loadable<[DriverProfile]> = .loading
    @State private var dqFiles: [DQFile] = []
    @State private var sendingCard: SendCardRequest?
    @State private var withdrawing: DriverProfile.CardUpdate?
    @State private var previewURL: URL?
    @State private var cardError: String?
    @State private var confirmingSignOut = false
    @State private var changingPhone = false
    @State private var newPhone = ""
    @State private var enteringCode = false
    @State private var code = ""
    @State private var pendingPhone = ""
    @State private var changeError: String?
    private let api = DriverAPI()

    var body: some View {
        List {
            switch profiles {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
            case .failed(let message):
                Section {
                    Label(message, systemImage: "wifi.exclamationmark")
                        .foregroundStyle(.secondary)
                    Button("Try again") { Task { await fetch() } }
                }
            case .loaded(let list) where list.isEmpty:
                Section {
                    Text("Your phone number isn't linked to a driver yet. Ask dispatch to add it to your driver record.")
                        .foregroundStyle(.secondary)
                }
            case .loaded(let list):
                ForEach(list) { profile in
                    details(profile, showsCompanyHeader: list.count > 1)
                }
            }

            Section {
                if case .signedIn(let phone) = session.state, !phone.isEmpty {
                    LabeledContent("Phone", value: phone.formattedPhone)
                }
                Button("Change phone number") {
                    newPhone = ""
                    changingPhone = true
                }
            } header: {
                Text("Account")
            } footer: {
                Text("You sign in with this number. Changing it updates it for dispatch too.")
            }

            // On its own: a full-width red button, confirmed with an alert.
            Section {
                Button(role: .destructive) {
                    confirmingSignOut = true
                } label: {
                    Text("Sign out").font(.headline).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .controlSize(.large)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            } footer: {
                Text(appVersion)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await fetch() }
        .task { await fetch() }
        .sheet(item: $sendingCard) { request in
            SendCardView(request: request) { await fetch() }
        }
        .quickLookPreview($previewURL)
        .alert(
            withdrawing.map { "Take back your new \($0.kind.name)?" } ?? "",
            isPresented: Binding(get: { withdrawing != nil }, set: { if !$0 { withdrawing = nil } }),
            presenting: withdrawing
        ) { update in
            Button("Take it back", role: .destructive) { Task { await withdraw(update) } }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("The office won't review it. You can send another one any time.")
        }
        .alert("Couldn't do that", isPresented: Binding(get: { cardError != nil }, set: { if !$0 { cardError = nil } })) {
            Button("OK") {}
        } message: {
            Text(cardError ?? "")
        }
        .alert("Sign out?", isPresented: $confirmingSignOut) {
            Button("Cancel", role: .cancel) {}
            Button("Sign out", role: .destructive) { Task { await session.signOut() } }
        } message: {
            Text("You'll need a code texted to your phone to sign back in.")
        }
        .alert("Change phone number", isPresented: $changingPhone) {
            TextField("New number", text: $newPhone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
            Button("Send code") { Task { await sendChangeCode() } }
                .keyboardShortcut(.defaultAction)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("We'll text a code to your new number.")
        }
        .alert("Enter the code", isPresented: $enteringCode) {
            TextField("6-digit code", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
            Button("Confirm") { Task { await confirmChange() } }
                .keyboardShortcut(.defaultAction)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("We texted it to \(pendingPhone.formattedPhone).")
        }
        .alert("Number not changed", isPresented: Binding(
            get: { changeError != nil },
            set: { if !$0 { changeError = nil } }
        )) {
            Button("OK") {}
        } message: {
            Text(changeError ?? "")
        }
    }

    @ViewBuilder
    private func details(_ profile: DriverProfile, showsCompanyHeader: Bool) -> some View {
        // With two carriers, every section says whose copy it is: each
        // carrier keeps its own driver file, and the dates can differ.
        let header = { (title: String) in
            showsCompanyHeader ? "\(title) · \(profile.organization.name)" : title
        }
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(profile.fullName)
                    .font(.title2.bold())
                Text([profile.organization.name, profile.startDate.map { "Driving since \(WallClock.fullDay($0))" }]
                    .compactMap { $0 }.joined(separator: " · "))
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
            if let phone = profile.organization.phone,
               let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                Link(destination: url) {
                    Label("Call Dispatch", systemImage: "phone")
                }
            }
        } header: {
            if showsCompanyHeader { Text(profile.organization.name) }
        }

        Section(header("License")) {
            LabeledContent("Type", value: [profile.licenseLabel, profile.cdlClass.map { "Class \($0)" }]
                .compactMap { $0 }.joined(separator: " · "))
            if profile.cdlState != nil || profile.cdlNumberLast4 != nil {
                LabeledContent("Number", value: [profile.cdlState, profile.cdlNumberLast4.map { "••••\($0)" }]
                    .compactMap { $0 }.joined(separator: " · "))
            }
            if !profile.cdlEndorsements.isEmpty {
                LabeledContent("Endorsements", value: profile.cdlEndorsements.joined(separator: ", "))
            }
            if let restrictions = profile.cdlRestrictions {
                LabeledContent("Restrictions", value: restrictions)
            }
            expiryRows(profile.cdlExpiresOn, what: "Your CDL")
            cardRows(profile, .cdl)
        }

        Section(header("Medical card")) {
            expiryRows(profile.medicalCardExpiresOn, what: "Your medical card")
            if profile.holdsMedicalVariance {
                Text("Medical variance on file").foregroundStyle(.secondary)
            }
            cardRows(profile, .medicalCard)
        }

        Section {
            NavigationLink {
                DQFileView(driverID: profile.driverId)
            } label: {
                let summary = dqSummary(profile)
                LabeledContent {
                    Text(summary.text).foregroundStyle(summary.color)
                } label: {
                    Label("DQ file", systemImage: "folder")
                }
            }
        } header: {
            Text(header("Driver qualification"))
        } footer: {
            Text("The papers the law says your carrier keeps on you.")
        }

        if let truck = profile.truck {
            Section(header("Truck")) {
                LabeledContent("Unit", value: truck.unitNumber)
                let vehicle = [truck.year.map(String.init), truck.make, truck.model].compactMap { $0 }
                if !vehicle.isEmpty {
                    LabeledContent("Vehicle", value: vehicle.joined(separator: " "))
                }
            }
        }

        if let pay = profile.payLabel {
            Section(header("Pay")) {
                LabeledContent("Rate", value: pay)
                LabeledContent("Paid", value: profile.payPeriodLabel)
            }
        }
    }

    /// Where a new card stands, and the button to send one.
    @ViewBuilder
    private func cardRows(_ profile: DriverProfile, _ kind: CardKind) -> some View {
        let update = profile.update(for: kind)
        if let update {
            if update.isPending {
                Label("New \(kind.name) sent (expires \(WallClock.fullDay(update.expiresOn))). The office is checking it.",
                      systemImage: "clock")
                    .foregroundStyle(.secondary)
                Button {
                    Task { await preview(update) }
                } label: {
                    Label("View what you sent", systemImage: "doc.text.magnifyingglass")
                }
                Button(role: .destructive) {
                    withdrawing = update
                } label: {
                    Label("Take it back", systemImage: "arrow.uturn.backward")
                }
            } else {
                Label("Your new \(kind.name) wasn't accepted\(update.reviewNote.map { ": \($0)" } ?? "."). Send it again.",
                      systemImage: "xmark.circle.fill")
                    .foregroundStyle(.red)
            }
        }
        Button {
            sendingCard = SendCardRequest(kind: kind, profile: profile)
        } label: {
            Label(update?.isPending == true ? "Send a different \(kind.name)" : "Upload new \(kind.name)",
                  systemImage: "camera.viewfinder")
        }
    }

    /// "2 need attention", "Being checked", "All set" for the DQ file row.
    private func dqSummary(_ profile: DriverProfile) -> (text: String, color: Color) {
        guard let file = dqFiles.first(where: { $0.driverId == profile.driverId }) else { return ("", .secondary) }
        guard file.setUp, !file.items.isEmpty else { return ("Not set up yet", .secondary) }
        let today = WallClock.today()
        let statuses = file.items.map { $0.status(today: today) }
        let attention = statuses.filter(\.needsAttention).count
        if attention > 0 { return ("\(attention) need\(attention == 1 ? "s" : "") attention", .orange) }
        if statuses.contains(.pendingReview) { return ("Being checked", .secondary) }
        return ("All set", .green)
    }

    /// The expiration date, and a warning within 30 days of it or after.
    @ViewBuilder
    private func expiryRows(_ date: String?, what: String) -> some View {
        if let date {
            LabeledContent("Expires", value: WallClock.fullDay(date))
            if let days = WallClock.daysUntil(date) {
                if days < 0 {
                    Label("\(what) has expired. Renew it before your next load.", systemImage: "exclamationmark.octagon.fill")
                        .foregroundStyle(.red)
                } else if days <= 30 {
                    Label(days == 0 ? "\(what) expires today." : "\(what) expires in \(days) \(days == 1 ? "day" : "days").",
                          systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }
        } else {
            LabeledContent("Expires", value: "Not on file")
        }
    }

    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "OfficeTruck \(version) (\(build))"
    }

    private func sendChangeCode() async {
        guard let number = PhoneNumber.e164(newPhone) else {
            await showChangeError("Enter a 10-digit US phone number.")
            return
        }
        if case .signedIn(let current) = session.state, PhoneNumber.e164(current) == number {
            await showChangeError("That's already your number.")
            return
        }
        do {
            try await session.sendChangeCode(to: number)
        } catch let error as AuthError where error.errorCode == .phoneExists {
            await showChangeError("That number already signs in to OfficeTruck. Ask dispatch for help.")
            return
        } catch {
            await showChangeError("We couldn't send a code to that number. If it's already used to sign in to OfficeTruck, ask dispatch for help.")
            return
        }
        pendingPhone = number
        code = ""
        // Let the first alert finish closing before the next one opens.
        try? await Task.sleep(for: .milliseconds(350))
        enteringCode = true
    }

    private func confirmChange() async {
        do {
            try await session.confirmChange(phone: pendingPhone, code: code.filter(\.isNumber))
        } catch is AuthError {
            await showChangeError("That code didn't work. Try changing your number again.")
            return
        } catch {
            // The login has the new number; the next app launch retries
            // copying it to the driver records.
            await showChangeError(error.driverMessage)
            return
        }
        await fetch()
    }

    private func showChangeError(_ message: String) async {
        try? await Task.sleep(for: .milliseconds(350))
        changeError = message
    }

    private func preview(_ update: DriverProfile.CardUpdate) async {
        do {
            previewURL = try await api.downloadForPreview(
                bucket: "driver-documents", path: update.path, name: "New \(update.kind.name)")
        } catch {
            cardError = "It couldn't be opened. Check your signal and try again."
        }
    }

    private func withdraw(_ update: DriverProfile.CardUpdate) async {
        do {
            try await api.withdrawCard(update)
            await fetch()
        } catch let error as PostgrestError {
            cardError = error.message
            await fetch()
        } catch {
            cardError = "It wasn't taken back. Check your signal and try again."
        }
    }

    private func fetch() async {
        // The DQ file row's summary is extra; Profile shows without it.
        async let files = try? api.myDQFile()
        do {
            profiles = .loaded(try await api.myProfile())
            dqFiles = await files ?? dqFiles
        } catch {
            if case .loaded = profiles { return }
            profiles = .failed(error.driverMessage)
        }
    }
}

extension String {
    /// "15550101234" → "(555) 010-1234".
    var formattedPhone: String {
        var digits = filter(\.isNumber)
        if digits.count == 11, digits.hasPrefix("1") { digits.removeFirst() }
        guard digits.count == 10 else { return self }
        let area = digits.prefix(3), mid = digits.dropFirst(3).prefix(3), last = digits.suffix(4)
        return "(\(area)) \(mid)-\(last)"
    }
}
