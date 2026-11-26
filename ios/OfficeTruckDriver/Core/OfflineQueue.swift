import Foundation
import Network
import Observation
import Storage
import Supabase

enum StopEvent: String, Codable, Sendable {
    case arrived, departed
}

/// A check-in tapped on the phone, waiting to reach the server.
struct PendingCheckIn: Codable, Identifiable, Sendable {
    var id = UUID()
    let loadID: UUID
    let stopID: UUID
    let event: StopEvent
    /// When the driver tapped it. Sent as is, so a check-in that waited for
    /// signal keeps its real time and a resend is recognized by the server.
    let tappedAt: Date
    let odometer: Int?
}

/// A scanned document waiting to reach the server. The PDF waits on disk
/// (see `OfflineQueue.fileURL(for:)`) until it's uploaded.
struct PendingDocument: Codable, Identifiable, Sendable {
    var id = UUID()
    let loadID: UUID
    let organizationID: UUID
    let kind: DocumentKind
    let fileName: String
    let sizeBytes: Int
    let createdAt: Date

    /// Where it goes in the load-documents bucket: <org>/<load>/<id>.pdf.
    /// Lowercase, to match how Postgres writes the ids.
    var storagePath: String {
        "\(organizationID.uuidString.lowercased())/\(loadID.uuidString.lowercased())/\(id.uuidString.lowercased()).pdf"
    }
}

/// Writes the driver makes, saved to disk and sent in order. One that can't
/// reach the server stays queued and is retried when the phone gets signal
/// or the app comes back to the front. One the server turns down (say, the
/// office already entered that time) is dropped and its reason kept in
/// `rejections` to show the driver.
@MainActor
@Observable
final class OfflineQueue {
    static let shared = OfflineQueue()

    private(set) var pending: [PendingCheckIn] = []
    private(set) var pendingDocuments: [PendingDocument] = []
    /// Why the server turned down a check-in or document, for an alert.
    var rejections: [String] = []
    /// Goes up each time something reaches the server, so screens reload.
    private(set) var deliveredCount = 0

    private let api = DriverAPI()
    private let monitor = NWPathMonitor()
    private var flushing = false
    private static let folder = URL.applicationSupportDirectory
    private let checkInsURL = folder.appending(path: "pending-check-ins.json")
    private let documentsURL = folder.appending(path: "pending-documents.json")

    private init() {
        pending = Self.read(checkInsURL) ?? []
        pendingDocuments = Self.read(documentsURL) ?? []
        monitor.pathUpdateHandler = { path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in await OfflineQueue.shared.flush() }
        }
        monitor.start(queue: DispatchQueue(label: "OfflineQueue.network"))
    }

    func checkIns(for loadID: UUID) -> [PendingCheckIn] {
        pending.filter { $0.loadID == loadID }
    }

    func documents(for loadID: UUID) -> [PendingDocument] {
        pendingDocuments.filter { $0.loadID == loadID }
    }

    /// The queued upload being sent right now, which can't be cancelled.
    private(set) var uploadingID: UUID?

    /// Drops a queued upload before it's sent. False if it's going out now.
    @discardableResult
    func cancelDocument(_ id: UUID) -> Bool {
        guard id != uploadingID, let document = pendingDocuments.first(where: { $0.id == id }) else { return false }
        try? FileManager.default.removeItem(at: Self.fileURL(for: document))
        pendingDocuments.removeAll { $0.id == id }
        save()
        return true
    }

    func enqueue(_ checkIn: PendingCheckIn) {
        pending.append(checkIn)
        save()
        Task { await flush() }
    }

    /// Keeps the PDF on disk and queues its upload.
    func enqueueDocument(loadID: UUID, organizationID: UUID, kind: DocumentKind, pdf: Data) {
        let document = PendingDocument(
            loadID: loadID,
            organizationID: organizationID,
            kind: kind,
            fileName: "\(kind.label) \(Date.now.formatted(.iso8601.year().month().day())).pdf",
            sizeBytes: pdf.count,
            createdAt: .now
        )
        do {
            try FileManager.default.createDirectory(at: Self.filesFolder, withIntermediateDirectories: true)
            try pdf.write(to: Self.fileURL(for: document), options: .atomic)
        } catch {
            rejections.append("The scan couldn't be saved on this phone.")
            return
        }
        pendingDocuments.append(document)
        save()
        Task { await flush() }
    }

    /// Where a queued document's PDF is kept until it's uploaded.
    static func fileURL(for document: PendingDocument) -> URL {
        filesFolder.appending(path: "\(document.id.uuidString).pdf")
    }

    private static let filesFolder = folder.appending(path: "pending-documents")

    /// Sends what's queued, oldest first: check-ins, then documents. Stops
    /// at the first one that can't reach the server, so things arrive in
    /// the order they were done.
    func flush() async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }

        while let next = pending.first {
            do {
                try await api.recordStopEvent(next)
            } catch let error as PostgrestError {
                rejections.append(error.message)
            } catch {
                return
            }
            pending.removeFirst()
            deliveredCount += 1
            save()
        }

        while let next = pendingDocuments.first {
            let file = Self.fileURL(for: next)
            uploadingID = next.id
            defer { uploadingID = nil }
            do {
                try await api.uploadDocument(next, file: file)
            } catch let error as PostgrestError {
                rejections.append(error.message)
            } catch let error as StorageError where error.statusCode?.hasPrefix("4") == true {
                rejections.append("The \(next.kind.label) upload was turned down: \(error.message)")
            } catch {
                return
            }
            try? FileManager.default.removeItem(at: file)
            pendingDocuments.removeAll { $0.id == next.id }
            deliveredCount += 1
            save()
        }
    }

    private func save() {
        Self.write(pending, to: checkInsURL)
        Self.write(pendingDocuments, to: documentsURL)
    }

    private static func read<T: Decodable>(_ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private static func write<T: Encodable>(_ value: T, to url: URL) {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? JSONEncoder().encode(value).write(to: url, options: .atomic)
    }
}
