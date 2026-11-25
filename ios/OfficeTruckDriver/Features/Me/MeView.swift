import SwiftUI

/// The driver's account. The DQ file, CDL and medical card come here next.
struct MeView: View {
    @Environment(SessionModel.self) private var session
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            List {
                Section("Signed in as") {
                    if case .signedIn(let phone) = session.state {
                        Text(phone.isEmpty ? "—" : phone.formattedPhone)
                            .font(.title3.monospacedDigit())
                    }
                }
                Section {
                    Button("Sign out", role: .destructive) { confirmingSignOut = true }
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
            .navigationTitle("Me")
            .confirmationDialog("Sign out of OfficeTruck?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await session.signOut() } }
            }
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
