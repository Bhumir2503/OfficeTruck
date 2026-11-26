import PhotosUI
import QuickLook
import Supabase
import SwiftUI

/// The driver's DQ (driver qualification) file for one carrier: what's
/// needed, what the office is checking, and what's done. Items that take a
/// document can be sent from here; the office confirms them on the web.
struct DQFileView: View {
    let driverID: UUID

    @State private var file: Loadable<DQFile?> = .loading
    @State private var adding: DQItem?
    @State private var scanItem: DQItem?
    @State private var photoItem: DQItem?
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var uploading: UUID?
    @State private var failure: String?
    @State private var previewURL: URL?
    @State private var removing: DQItem.DQDocument?
    private let api = DriverAPI()

    var body: some View {
        Group {
            switch file {
            case .loading:
                ProgressView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Couldn't load", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await fetch() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded(let found):
                if let found, found.setUp, !found.items.isEmpty {
                    checklist(found)
                } else {
                    ContentUnavailableView(
                        "Not set up yet",
                        systemImage: "folder",
                        description: Text("The office starts your file on your first day. Check back then.")
                    )
                }
            }
        }
        .navigationTitle("DQ file")
        .navigationBarTitleDisplayMode(.inline)
        .task { await fetch() }
        .alert(
            "Send a copy",
            isPresented: Binding(get: { adding != nil }, set: { if !$0 { adding = nil } }),
            presenting: adding
        ) { item in
            Button("Scan") { scanItem = item }
                .keyboardShortcut(.defaultAction)
            Button("Choose from Photos") { photoItem = item }
            Button("Cancel", role: .cancel) {}
        } message: { item in
            Text("\(item.displayTitle)\n\nThe office checks it before it counts.")
        }
        .quickLookPreview($previewURL)
        .alert(
            "Take it back?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            presenting: removing
        ) { doc in
            Button("Take it back", role: .destructive) { Task { await remove(doc) } }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("The office won't see it. You can send another copy any time.")
        }
        .alert("Couldn't do that", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
            Button("OK") {}
        } message: {
            Text(failure ?? "")
        }
        .fullScreenCover(item: $scanItem) { item in
            DocumentScanner(
                onScan: { pages in
                    scanItem = nil
                    send(pages, for: item)
                },
                onCancel: { scanItem = nil }
            )
            .ignoresSafeArea()
        }
        .photosPicker(
            isPresented: Binding(get: { photoItem != nil }, set: { if !$0 && photoItems.isEmpty { photoItem = nil } }),
            selection: $photoItems, maxSelectionCount: 10, matching: .images
        )
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty, let item = photoItem else { return }
            photoItems = []
            photoItem = nil
            Task {
                var pages: [UIImage] = []
                for picked in items {
                    if let data = try? await picked.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        pages.append(image)
                    }
                }
                send(pages, for: item)
            }
        }
    }

    private func checklist(_ file: DQFile) -> some View {
        let today = WallClock.today()
        let rows = file.items.map { ($0, $0.status(today: today)) }
        let attention = rows.filter { $0.1.needsAttention }
        let waiting = rows.filter { $0.1 == .pendingReview }
        let upcoming = rows.filter { $0.1 == .upcoming }
        let done = rows.filter { $0.1 == .complete || $0.1 == .notApplicable }

        return List {
            Section {
                LabeledContent("Carrier", value: file.organization.name)
                if attention.isEmpty {
                    Label("Nothing needed from you right now.", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                }
            } footer: {
                Text("Your driver qualification file: the papers the law says your carrier keeps on you.")
            }
            if !attention.isEmpty {
                Section("Needs attention") { ForEach(attention, id: \.0.id) { row($0.0, $0.1, in: file) } }
            }
            if !waiting.isEmpty {
                Section("Waiting for the office") { ForEach(waiting, id: \.0.id) { row($0.0, $0.1, in: file) } }
            }
            if !upcoming.isEmpty {
                Section("Coming up") { ForEach(upcoming, id: \.0.id) { row($0.0, $0.1, in: file) } }
            }
            if !done.isEmpty {
                Section("Done") { ForEach(done, id: \.0.id) { row($0.0, $0.1, in: file) } }
            }
        }
        .refreshable { await fetch() }
    }

    @ViewBuilder
    private func row(_ item: DQItem, _ status: DQItem.Status, in file: DQFile) -> some View {
        let sendable = item.canUpload && status != .pendingReview && status != .notApplicable
        VStack(alignment: .leading, spacing: 6) {
            Text(item.displayTitle)
            switch status {
            case .missing:
                Label("Needed", systemImage: "exclamationmark.circle.fill").foregroundStyle(.red)
            case .overdue:
                Label(item.completedAt == nil ? "Overdue" : "Expired", systemImage: "exclamationmark.octagon.fill")
                    .foregroundStyle(.red)
            case .dueSoon:
                Label(item.completedAt == nil
                      ? "Due \(item.dueDate.map(WallClock.fullDay) ?? "soon")"
                      : "Runs out \(item.validUntil.map(WallClock.fullDay) ?? "soon")",
                      systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            case .pendingReview:
                Label("The office is checking it", systemImage: "clock").foregroundStyle(.secondary)
            case .upcoming:
                Label("Due \(item.dueDate.map(WallClock.fullDay) ?? "later")", systemImage: "calendar")
                    .foregroundStyle(.secondary)
            case .complete:
                Label(item.validUntil.map { "Good until \(WallClock.fullDay($0))" } ?? "Done",
                      systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .notApplicable:
                Label("Not needed", systemImage: "minus.circle").foregroundStyle(.secondary)
            }
            if status.needsAttention, let description = item.description {
                Text(description).font(.footnote).foregroundStyle(.secondary)
            }
            // What's on file: tap to open; take back your own while the
            // office hasn't confirmed it.
            ForEach(item.documents) { doc in
                HStack {
                    Button {
                        Task { await preview(doc) }
                    } label: {
                        Label(doc.confirmed
                              ? "On file"
                              : "\(doc.mine ? "You sent" : "Added") \(doc.createdAt.formatted(date: .abbreviated, time: .omitted))",
                              systemImage: "doc.text")
                    }
                    .buttonStyle(.borderless)
                    Spacer()
                    if doc.canRemove {
                        Button("Take back", role: .destructive) { removing = doc }
                            .buttonStyle(.borderless)
                    }
                }
                .font(.subheadline)
            }
            if uploading == item.id {
                ProgressView("Sending…")
            } else if sendable && (status.needsAttention || status == .upcoming) {
                Button {
                    adding = item
                } label: {
                    Label("Send a copy", systemImage: "doc.badge.plus")
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
            }
        }
        .font(.body)
        .labelStyle(.titleAndIcon)
        .padding(.vertical, 2)
    }

    private func send(_ pages: [UIImage], for item: DQItem) {
        guard case .loaded(let found?) = file, let pdf = DocumentPDF.make(from: pages) else { return }
        uploading = item.id
        Task {
            defer { uploading = nil }
            do {
                try await api.uploadDQDocument(item, in: found, pdf: pdf)
                await fetch()
            } catch {
                failure = "It wasn't sent. Check your signal and try again."
            }
        }
    }

    private func preview(_ doc: DQItem.DQDocument) async {
        do {
            previewURL = try await api.downloadForPreview(bucket: "dq-files", path: doc.path, name: doc.fileName)
        } catch {
            failure = "It couldn't be opened. Check your signal and try again."
        }
    }

    private func remove(_ doc: DQItem.DQDocument) async {
        do {
            try await api.removeDQDocument(doc.id)
        } catch let error as PostgrestError {
            failure = error.message
        } catch {
            failure = "It wasn't taken back. Check your signal and try again."
        }
        await fetch()
    }

    private func fetch() async {
        do {
            file = .loaded(try await api.myDQFile().first { $0.driverId == driverID })
        } catch {
            if case .loaded = file { return }
            file = .failed(error.driverMessage)
        }
    }
}
