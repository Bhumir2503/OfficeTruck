import Foundation
import Supabase

/// The driver-scoped RPCs. Drivers never read tables directly; see
/// supabase/migrations/*_driver_app.sql.
struct DriverAPI: Sendable {
    var client: SupabaseClient = SupabaseService.client

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = Self.parseTimestamp(text) { return date }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath, debugDescription: "Unreadable date \(text)"))
        }
        return decoder
    }()

    /// Postgres timestamptz in JSON: "2026-11-25T14:03:11.123456+00:00".
    private static func parseTimestamp(_ text: String) -> Date? {
        let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        let plain = Date.ISO8601FormatStyle()
        return (try? withFraction.parse(text)) ?? (try? plain.parse(text))
    }

    /// Ties this signed-in phone number to the driver records that use it.
    func claimDriverLogins() async throws {
        try await client.rpc("claim_driver_logins").execute()
    }

    func myLoads() async throws -> [LoadSummary] {
        #if DEBUG
        if DemoBackend.isOn { return try decode(DemoBackend.loadsJSON()) }
        #endif
        return try await decode(client.rpc("my_loads").execute().data)
    }

    func myLoad(_ id: UUID) async throws -> LoadDetail {
        #if DEBUG
        if DemoBackend.isOn { return try decode(DemoBackend.loadJSON()) }
        #endif
        return try await decode(client.rpc("my_load", params: ["target_load": id]).execute().data)
    }

    /// Arrived or Departed at a stop. Safe to resend: the server accepts the
    /// same stop, event and tap time again.
    func recordStopEvent(_ checkIn: PendingCheckIn) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.record(checkIn) }
        #endif
        struct Params: Encodable {
            let target_stop: UUID
            let event: String
            let tapped_at: String
            let odometer: Int?
        }
        let params = Params(
            target_stop: checkIn.stopID,
            event: checkIn.event.rawValue,
            // "2026-11-25T14:03:11.123Z": milliseconds, so a resend matches.
            tapped_at: Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(checkIn.tappedAt),
            odometer: checkIn.odometer
        )
        try await client.rpc("record_my_stop_event", params: params).execute()
    }

    /// Uploads a scanned PDF to the load's folder, then adds it to the load.
    /// Safe to retry: a file already uploaded (409) moves on, and the server
    /// returns the same document for the same path.
    func uploadDocument(_ document: PendingDocument, file: URL) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.addDocument(document) }
        #endif
        do {
            try await client.storage.from("load-documents").upload(
                document.storagePath,
                fileURL: file,
                options: FileOptions(contentType: "application/pdf", upsert: false)
            )
        } catch let error as StorageError where error.statusCode == "409" {
            // Uploaded on an earlier try that lost its connection.
        }

        struct Params: Encodable {
            let target_load: UUID
            let kind: String
            let path: String
            let file_name: String
            let content_type: String
            let size_bytes: Int
        }
        try await client.rpc("add_my_load_document", params: Params(
            target_load: document.loadID,
            kind: document.kind.rawValue,
            path: document.storagePath,
            file_name: document.fileName,
            content_type: "application/pdf",
            size_bytes: document.sizeBytes
        )).execute()
    }

    /// The signed-in driver, once per carrier they drive for (usually one).
    func myProfile() async throws -> [DriverProfile] {
        #if DEBUG
        if DemoBackend.isOn { return try decode(DemoBackend.profileJSON()) }
        #endif
        return try await decode(client.rpc("my_profile").execute().data)
    }

    func mySettlements() async throws -> [SettlementSummary] {
        #if DEBUG
        if DemoBackend.isOn { return try decode(Data(DemoBackend.settlementsJSON.utf8)) }
        #endif
        return try await decode(client.rpc("my_settlements").execute().data)
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        try Self.decoder.decode(T.self, from: data)
    }
}
