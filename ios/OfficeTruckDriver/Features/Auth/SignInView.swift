import Lottie
import Supabase
import SwiftUI

/// The landing screen: the headline, the cargo animation and a Sign in
/// button. Sign in pushes a plain form for the phone number, then one for
/// the 6-digit code Twilio Verify texts to it (through Supabase Auth).
struct SignInView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// One path for both pages, so pushing the code page never rebuilds
    /// the phone page (and loses what was typed).
    @State private var path: [SignInStep] = []

    var body: some View {
        NavigationStack(path: $path) {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Let's get you\non the road.")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                    Text("Your loads, stops and pay, all in one place.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 32)

                // Resources/Cargo.json. Holds still with Reduce Motion.
                LottieView(animation: .named("Cargo"))
                    .resizable()
                    .playbackMode(reduceMotion
                        ? .paused(at: .progress(0.5))
                        : .playing(.toProgress(1, loopMode: .loop)))
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.vertical, 16)
                    .accessibilityHidden(true)

                VStack(spacing: 14) {
                    Button {
                        path.append(.phone)
                    } label: {
                        Text("Sign in").font(.headline).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .controlSize(.extraLarge)

                    Text("Use the phone number your dispatcher has on file.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.bottom, 8)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                LinearGradient(
                    colors: [Color.accentColor.opacity(0.22), Color.accentColor.opacity(0.06), Color(.systemBackground)],
                    startPoint: .top, endPoint: .center
                )
                .ignoresSafeArea()
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: SignInStep.self) { step in
                switch step {
                case .phone: PhoneView { path.append(.code(phone: $0)) }
                case .code(let phone): CodeView(phone: phone)
                }
            }
        }
    }
}

private enum SignInStep: Hashable {
    case phone
    case code(phone: String)
}

/// The phone number. Moves on to the code once the text is sent.
private struct PhoneView: View {
    let onSent: (String) -> Void
    @Environment(SessionModel.self) private var session

    @State private var phone = ""
    @State private var working = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        Form {
            Section {
                TextField("(555) 555-5555", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focused)
                    .onChange(of: phone) { _, new in
                        // Once the number is complete (typed, pasted or
                        // autofilled), show it as the office app does:
                        // (901) 555-0177. Not while typing: rewriting the
                        // text mid-entry moves the cursor and drops digits.
                        guard let number = PhoneNumber.e164(new) else { return }
                        let formatted = number.formattedPhone
                        if formatted != new { phone = formatted }
                    }
            } header: {
                Text("Phone number")
            } footer: {
                Text("Use the number your dispatcher has on file. We'll text you a code.")
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }

        }
        .navigationTitle("Sign in")
        // Pinned to the bottom like Check in, so it rides above the keyboard.
        .safeAreaInset(edge: .bottom) {
            Group {
                if #available(iOS 26.0, *) {
                    Button(action: sendCode) {
                        Text(working ? "Sending…" : "Continue").font(.headline).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                } else {
                    Button(action: sendCode) {
                        Text(working ? "Sending…" : "Continue").font(.headline).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .controlSize(.extraLarge)
            .disabled(working || PhoneNumber.e164(phone) == nil)
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .onAppear { focused = true }
    }

    private func sendCode() {
        guard let number = PhoneNumber.e164(phone) else { return }
        error = nil
        working = true
        Task {
            defer { working = false }
            do {
                try await session.sendCode(to: number)
                onSent(number)
            } catch {
                self.error = SignInError.message(for: error, sending: true)
            }
        }
    }
}

/// The 6-digit code. Signs in on its own once all 6 digits are in, which
/// is what happens when iOS fills the code from the text message.
private struct CodeView: View {
    let phone: String
    @Environment(SessionModel.self) private var session

    @State private var code = ""
    @State private var working = false
    @State private var error: String?
    @State private var canResendAt = Date.now.addingTimeInterval(60)
    @FocusState private var focused: Bool

    var body: some View {
        Form {
            Section {
                TextField("6-digit code", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($focused)
                    .onChange(of: code) { _, new in
                        let digits = String(new.filter(\.isNumber).prefix(6))
                        if digits != new { code = digits }
                        if digits.count == 6, !working { verify() }
                    }
            } header: {
                Text("Code")
            } footer: {
                Text("We texted it to \(phone.formattedPhone).")
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }

        }
        .navigationTitle("Enter code")
        // Resend as a line of text, then the main button, pinned to the
        // bottom like the phone page so both ride above the keyboard.
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 12) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let wait = Int(canResendAt.timeIntervalSince(context.date).rounded(.up))
                    Button(action: resend) {
                        if wait > 0 {
                            Text("Didn't get it? Resend in \(wait)s")
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Didn't get it? ").foregroundStyle(.secondary)
                                + Text("Resend code").fontWeight(.semibold).foregroundStyle(.tint)
                        }
                    }
                    .font(.subheadline)
                    .disabled(wait > 0 || working)
                }

                Group {
                    if #available(iOS 26.0, *) {
                        Button(action: verify) {
                            Text(working ? "Signing in…" : "Continue").font(.headline).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glassProminent)
                    } else {
                        Button(action: verify) {
                            Text(working ? "Signing in…" : "Continue").font(.headline).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .controlSize(.extraLarge)
                .disabled(working || code.count != 6)
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .onAppear { focused = true }
    }

    private func verify() {
        error = nil
        working = true
        Task {
            defer { working = false }
            do {
                try await session.verify(phone: phone, code: code)
            } catch {
                self.error = SignInError.message(for: error, sending: false)
                code = ""
            }
        }
    }

    private func resend() {
        error = nil
        canResendAt = .now.addingTimeInterval(60)
        Task {
            do {
                try await session.sendCode(to: phone)
            } catch {
                self.error = SignInError.message(for: error, sending: true)
            }
        }
    }
}

enum SignInError {
    /// What went wrong, in words a driver can act on.
    static func message(for error: Error, sending: Bool) -> String {
        if let auth = error as? AuthError {
            switch auth.errorCode {
            case .overSMSSendRateLimit, .overRequestRateLimit:
                return "Too many codes sent. Wait a minute and try again."
            case .otpExpired:
                return "That code has expired or isn't right. Tap Resend code for a new one."
            case .smsSendFailed, .validationFailed:
                return "We couldn't text that number. Check it and try again."
            case .phoneProviderDisabled, .otpDisabled:
                return "Text sign-in is turned off. Ask dispatch for help."
            default:
                break
            }
        }
        if (error as? URLError) != nil {
            return "No connection. Check your signal and try again."
        }
        return sending
            ? "We couldn't send a code to that number. Try again."
            : "That code didn't work. Check it and try again."
    }
}

#Preview {
    SignInView().environment(SessionModel())
}
