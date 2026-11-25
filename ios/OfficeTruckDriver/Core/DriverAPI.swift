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
