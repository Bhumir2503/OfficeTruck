import SwiftUI

/// The driver's profile, opened from Trips: who they are, their CDL and
/// medical card (with a warning before either runs out), their truck and how
/// they're paid. The driver qualification to-do list comes here next.
struct MeView: View {
    @Environment(SessionModel.self) private var session
    @State private var profiles: Loadable<[DriverProfile]> = .loading
    @State private var confirmingSignOut = false
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
                    LabeledContent("Signed in as", value: phone.formattedPhone)
                }
                Button("Sign out", role: .destructive) { confirmingSignOut = true }
            } footer: {
                Text(appVersion)
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await fetch() }
        .task { await fetch() }
        .confirmationDialog("Sign out of OfficeTruck?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await session.signOut() } }
        }
    }

    @ViewBuilder
    private func details(_ profile: DriverProfile, showsCompanyHeader: Bool) -> some View {
        Section {
            LabeledContent("Name", value: profile.fullName)
            LabeledContent("Company", value: profile.organization.name)
            if let start = profile.startDate {
                LabeledContent("Driving since", value: WallClock.fullDay(start))
            }
            if let phone = profile.organization.phone,
               let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                Link(destination: url) {
                    Label("Call Dispatch", systemImage: "phone")
                }
            }
        } header: {
            if showsCompanyHeader { Text(profile.organization.name) }
        }

        Section("License") {
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
        }

        Section("Medical card") {
            expiryRows(profile.medicalCardExpiresOn, what: "Your medical card")
            if profile.holdsMedicalVariance {
                Text("Medical variance on file").foregroundStyle(.secondary)
            }
        }

        if let truck = profile.truck {
            Section("Truck") {
                LabeledContent("Unit", value: truck.unitNumber)
                let vehicle = [truck.year.map(String.init), truck.make, truck.model].compactMap { $0 }
                if !vehicle.isEmpty {
                    LabeledContent("Vehicle", value: vehicle.joined(separator: " "))
                }
            }
        }

        if let pay = profile.payLabel {
            Section("Pay") {
                LabeledContent("Rate", value: pay)
                LabeledContent("Paid", value: profile.payPeriodLabel)
            }
        }
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

    private func fetch() async {
        do {
            profiles = .loaded(try await api.myProfile())
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
