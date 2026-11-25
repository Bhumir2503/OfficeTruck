import SwiftUI

/// Phone number, then the 6-digit code from the text message.
struct SignInView: View {
    @Environment(SessionModel.self) private var session

    @State private var phone = ""
    @State private var code = ""
    @State private var sentTo: String?
    @State private var working = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Image(systemName: "truck.box.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.tint)
                    Text("OfficeTruck")
                        .font(.largeTitle.bold())
                    Text(sentTo == nil
                         ? "Sign in with the phone number your dispatcher has on file."
                         : "Enter the code we texted to \(sentTo!).")
                        .foregroundStyle(.secondary)
                }

                if sentTo == nil {
                    TextField("Phone number", text: $phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .font(.title2)
                        .padding()
                        .frame(minHeight: 56)
                        .background(.fill.tertiary, in: .rect(cornerRadius: 12))
                        .focused($focused)
                } else {
                    TextField("6-digit code", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .font(.title2.monospacedDigit())
                        .padding()
                        .frame(minHeight: 56)
                        .background(.fill.tertiary, in: .rect(cornerRadius: 12))
                        .focused($focused)
                }

                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }

                Button(action: submit) {
                    Group {
                        if working {
                            ProgressView()
                        } else {
                            Text(sentTo == nil ? "Text me a code" : "Sign in")
                        }
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 56)
                }
                .buttonStyle(.borderedProminent)
                .disabled(working || !canSubmit)

                if sentTo != nil {
                    Button("Use a different number") {
                        sentTo = nil
                        code = ""
                        error = nil
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }

                Spacer()
            }
            .padding(24)
            .onAppear { focused = true }
        }
    }

    private var canSubmit: Bool {
        sentTo == nil ? PhoneNumber.e164(phone) != nil : code.filter(\.isNumber).count == 6
    }

    private func submit() {
        error = nil
        working = true
        Task {
            defer { working = false }
            do {
                if let number = sentTo {
                    try await session.verify(phone: number, code: code.filter(\.isNumber))
                } else if let number = PhoneNumber.e164(phone) {
                    try await session.sendCode(to: number)
                    sentTo = number
                    focused = true
                }
            } catch {
                self.error = sentTo == nil
                    ? "We couldn't send a code to that number."
                    : "That code didn't work. Check it and try again."
            }
        }
    }
}

#Preview {
    SignInView().environment(SessionModel())
}
