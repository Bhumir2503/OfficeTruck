import Foundation
import Network
import Observation
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
    /// Why the server turned down a check-in, for an alert.
    var rejections: [String] = []
    /// Goes up each time a check-in reaches the server, so screens reload.
    private(set) var deliveredCount = 0

    private let api = DriverAPI()
    private let monitor = NWPathMonitor()
    private var flushing = false
    private let fileURL = URL.applicationSupportDirectory.appending(path: "pending-check-ins.json")

    private init() {
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([PendingCheckIn].self, from: data) {
            pending = saved
        }
        monitor.pathUpdateHandler = { path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in await OfflineQueue.shared.flush() }
        }
        monitor.start(queue: DispatchQueue(label: "OfflineQueue.network"))
    }

    func checkIns(for loadID: UUID) -> [PendingCheckIn] {
        pending.filter { $0.loadID == loadID }
    }

    func enqueue(_ checkIn: PendingCheckIn) {
        pending.append(checkIn)
        save()
        Task { await flush() }
    }

    /// Sends what's queued, oldest first. Stops at the first one that can't
    /// reach the server, so check-ins arrive in the order they were tapped.
    func flush() async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }

        while let next = pending.first {
            do {
                try await api.recordStopEvent(next)
                pending.removeFirst()
                deliveredCount += 1
                save()
            } catch let error as PostgrestError {
                pending.removeFirst()
                rejections.append(error.message)
                deliveredCount += 1
                save()
            } catch {
                return
            }
        }
    }

    private func save() {
        try? FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(pending).write(to: fileURL, options: .atomic)
    }
}
