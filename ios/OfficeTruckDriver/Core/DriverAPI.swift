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
        try await decode(client.rpc("my_loads").execute().data)
    }

    func myLoad(_ id: UUID) async throws -> LoadDetail {
        try await decode(client.rpc("my_load", params: ["target_load": id]).execute().data)
    }

    func mySettlements() async throws -> [SettlementSummary] {
        try await decode(client.rpc("my_settlements").execute().data)
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        try Self.decoder.decode(T.self, from: data)
    }
}
