import PhotosUI
import SwiftUI

/// What to send: which card, for which carrier's driver record.
struct SendCardRequest: Identifiable {
    let kind: CardKind
    let profile: DriverProfile
    var id: String { "\(profile.driverId)-\(kind.rawValue)" }
}

/// A new CDL or medical card: a copy (scanned or from Photos) and the
/// expiration date printed on it. The office checks both before Profile
/// changes.
struct SendCardView: View {
    let request: SendCardRequest
    /// Called once it's sent, before the sheet closes.
    let onSent: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var pages: [UIImage] = []
    @State private var expires = Calendar.current.startOfDay(for: .now)
    @State private var scanning = false
    @State private var choosingPhotos = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var sending = false
    @State private var error: String?
    private let api = DriverAPI()

    private var kind: CardKind { request.kind }
    private var datePicked: Bool { expires > Calendar.current.startOfDay(for: .now) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let first = pages.first {
                        Image(uiImage: first)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity, maxHeight: 220)
                            .clipShape(.rect(cornerRadius: 8))
                            .accessibilityLabel("Copy of your \(kind.name)")
                        if pages.count > 1 {
                            LabeledContent("Pages", value: "\(pages.count)")
                        }
                        Button("Take it again", role: .destructive) { pages = [] }
                    } else {
                        Button {
                            scanning = true
                        } label: {
                            Label("Scan your \(kind.name)", systemImage: "doc.viewfinder")
                        }
                        Button {
                            choosingPhotos = true
                        } label: {
                            Label("Choose from Photos", systemImage: "photo.on.rectangle")
                        }
                    }
                } header: {
                    Text("Copy")
                } footer: {
                    Text("Scan both sides if there's anything on the back.")
                }

                Section {
                    DatePicker("Expires", selection: $expires, in: Calendar.current.startOfDay(for: .now)...,
                               displayedComponents: .date)
                } footer: {
                    Text("The date printed on your \(kind.name). The office checks it before your profile changes.")
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("New \(kind.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(sending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    // A spinner in place of Send while the card uploads.
                    if sending {
                        ProgressView()
                            .accessibilityLabel("Uploading")
                    } else {
                        Button("Send", action: send)
                            .disabled(pages.isEmpty || !datePicked)
                    }
                }
            }
            .interactiveDismissDisabled(sending)
            .fullScreenCover(isPresented: $scanning) {
                DocumentScanner(
                    onScan: { scanned in
                        pages = scanned
                        scanning = false
                    },
                    onCancel: { scanning = false }
                )
                .ignoresSafeArea()
            }
            .photosPicker(isPresented: $choosingPhotos, selection: $photoItems, maxSelectionCount: 2, matching: .images)
            .onChange(of: photoItems) { _, items in
                guard !items.isEmpty else { return }
                photoItems = []
                Task {
                    var picked: [UIImage] = []
                    for item in items {
                        if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                            picked.append(image)
                        }
                    }
                    pages = picked
                }
            }
        }
    }

    private func send() {
        guard let pdf = DocumentPDF.make(from: pages) else {
            error = "That copy couldn't be read. Take it again."
            return
        }
        error = nil
        sending = true
        Task {
            defer { sending = false }
            do {
                try await api.sendCard(kind, for: request.profile, expiresOn: WallClock.string(from: expires), pdf: pdf)
                await onSent()
                dismiss()
            } catch {
                self.error = "It wasn't sent. Check your signal and try again."
            }
        }
    }
}
