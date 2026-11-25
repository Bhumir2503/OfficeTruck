import Foundation
import Observation
import Supabase

/// Who's signed in. Follows Supabase's auth state, so a session restored
/// from the Keychain at launch signs the driver straight in.
@MainActor
@Observable
final class SessionModel {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(phone: String)
    }

    private(set) var state: State = .loading
    private let client = SupabaseService.client
    private var listener: Task<Void, Never>?

    func start() {
        #if DEBUG
        if DemoBackend.isOn {
            state = .signedIn(phone: "+15550101234")
            return
        }
        #endif
        guard listener == nil else { return }
        listener = Task { [weak self] in
            guard let client = self?.client else { return }
            for await change in client.auth.authStateChanges {
                guard let self else { return }
                await self.apply(change.event, change.session)
            }
        }
    }

    private func apply(_ event: AuthChangeEvent, _ session: Session?) async {
        // A stored session that has expired still counts: the client
        // refreshes it on the next request, and a driver without signal
        // shouldn't be signed out for it.
        guard let session else {
            state = .signedOut
            return
        }
        if event == .signedIn || event == .initialSession {
            // Links this phone number to the driver records that use it,
            // and finishes a number change that lost signal halfway.
            try? await DriverAPI().claimDriverLogins()
            try? await DriverAPI().updateMyPhone()
        }
        state = .signedIn(phone: session.user.phone ?? "")
    }

    /// Sends the SMS code. `phone` is ten US digits or +1…
    func sendCode(to phone: String) async throws {
        try await client.auth.signInWithOTP(phone: phone)
    }

    func verify(phone: String, code: String) async throws {
        try await client.auth.verifyOTP(phone: phone, token: code, type: .sms)
    }

    /// Texts a code to the driver's new number. Nothing changes until the
    /// code is entered.
    func sendChangeCode(to phone: String) async throws {
        #if DEBUG
        if DemoBackend.isOn { return }
        #endif
        try await client.auth.update(user: UserAttributes(phone: phone))
    }

    /// Moves the login to the new number, then the driver records, so
    /// dispatch sees it in the office app.
    func confirmChange(phone: String, code: String) async throws {
        #if DEBUG
        if DemoBackend.isOn {
            state = .signedIn(phone: phone)
            return
        }
        #endif
        try await client.auth.verifyOTP(phone: phone, token: code, type: .phoneChange)
        try await DriverAPI().updateMyPhone()
    }

    func signOut() async {
        try? await client.auth.signOut()
    }
}

enum PhoneNumber {
    /// "(555) 010-1234" → "+15550101234". Nil unless it's a US number.
    static func e164(_ input: String) -> String? {
        var digits = input.filter(\.isNumber)
        if digits.count == 11, digits.hasPrefix("1") { digits.removeFirst() }
        return digits.count == 10 ? "+1" + digits : nil
    }
}
