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
        /// Signed in, but no carrier has this number on a driver record.
        case notLinked(phone: String)
    }

    private(set) var state: State = .loading
    private let client = SupabaseService.client
    private var listener: Task<Void, Never>?

    func start() {
        #if DEBUG
        if DemoBackend.isOn {
            state = DemoBackend.startsSignedOut ? .signedOut : .signedIn(phone: "+15550101234")
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
        let phone = session.user.phone ?? ""
        if event == .signedIn || event == .initialSession {
            await link(phone: phone)
        } else if case .notLinked = state {
            state = .notLinked(phone: phone)
        } else {
            state = .signedIn(phone: phone)
        }
    }

    /// Links this phone number to the driver records that use it (and
    /// finishes a number change that lost signal halfway), then checks
    /// there's at least one. With no signal, the driver goes in anyway.
    private func link(phone: String) async {
        let api = DriverAPI()
        try? await api.claimDriverLogins()
        try? await api.updateMyPhone()
        if let profiles = try? await api.myProfile(), profiles.isEmpty {
            state = .notLinked(phone: phone)
        } else {
            state = .signedIn(phone: phone)
        }
    }

    /// Tries linking again, after dispatch adds the number.
    func retryLink() async {
        guard let session = try? await client.auth.session else { return }
        await link(phone: session.user.phone ?? "")
    }

    /// Sends the SMS code. `phone` is ten US digits or +1…
    func sendCode(to phone: String) async throws {
        #if DEBUG
        if DemoBackend.isOn { return }
        #endif
        try await client.auth.signInWithOTP(phone: phone)
    }

    func verify(phone: String, code: String) async throws {
        #if DEBUG
        if DemoBackend.isOn {
            state = .signedIn(phone: phone)
            return
        }
        #endif
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

    /// Signs out on this phone right away, signal or not; the server
    /// forgets the session when it can.
    func signOut() async {
        #if DEBUG
        if DemoBackend.isOn {
            state = .signedOut
            return
        }
        #endif
        // This phone stops getting the signed-out driver's pushes.
        if let token = PushCenter.shared.token {
            try? await DriverAPI().removePushToken(token)
        }
        try? await client.auth.signOut()
        state = .signedOut
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
