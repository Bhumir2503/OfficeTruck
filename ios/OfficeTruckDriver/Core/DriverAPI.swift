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

    /// Copies the login's verified phone number to the driver records, so
    /// the office app shows it. Does nothing when they already match.
    func updateMyPhone() async throws {
        #if DEBUG
        if DemoBackend.isOn { return }
        #endif
        try await client.rpc("update_my_phone").execute()
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
        if DemoBackend.isOn { return try DemoBackend.record(checkIn) }
        #endif
        struct Params: Encodable {
            let target_stop: UUID
            let event: String
            let tapped_at: String
            let odometer: Int?
            // Left out when there's no fix, so the server's defaults apply.
            let latitude: Double?
            let longitude: Double?
            let location_accuracy: Double?
        }
        let params = Params(
            target_stop: checkIn.stopID,
            event: checkIn.event.rawValue,
            // "2026-11-25T14:03:11.123Z": milliseconds, so a resend matches.
            tapped_at: Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(checkIn.tappedAt),
            odometer: checkIn.odometer,
            latitude: checkIn.latitude,
            longitude: checkIn.longitude,
            location_accuracy: checkIn.locationAccuracy
        )
        try await client.rpc("record_my_stop_event", params: params).execute()
    }

    /// Keeps this phone's push token on the server, so dispatch can notify
    /// the driver. Development builds use Apple's sandbox push server.
    func registerPushToken(_ token: String) async throws {
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        try await client.rpc("register_my_push_token", params: [
            "push_token": token, "push_environment": environment,
        ]).execute()
    }

    /// Stops pushes to this phone (on sign-out).
    func removePushToken(_ token: String) async throws {
        try await client.rpc("remove_my_push_token", params: ["push_token": token]).execute()
    }

    /// Adds or fixes the odometer at a stop the driver already checked in at.
    /// Needs signal: it isn't queued, so the driver sees right away if the
    /// server turns it down (lower than the truck's last reading, say).
    func setStopOdometer(stopID: UUID, event: StopEvent, reading: Int) async throws {
        #if DEBUG
        if DemoBackend.isOn { return try DemoBackend.setOdometer(stopID: stopID, event: event, reading: reading) }
        #endif
        struct Params: Encodable {
            let target_stop: UUID
            let event: String
            let reading: Int
        }
        try await client.rpc("set_my_stop_odometer", params: Params(
            target_stop: stopID, event: event.rawValue, reading: reading
        )).execute()
    }

    /// Uploads a scanned PDF to the load's folder, then adds it to the load.
    /// Safe to retry: a file already uploaded (409) moves on, and the server
    /// returns the same document for the same path.
    func uploadDocument(_ document: PendingDocument, file: URL) async throws {
        #if DEBUG
        if DemoBackend.isOn { return try await DemoBackend.addDocument(document) }
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

    /// An expense the driver paid out of pocket. Uploads the receipt to the
    /// load's folder first, if there is one. Safe to retry: a receipt
    /// already uploaded (409) moves on, and the server returns the same
    /// expense for the same client id.
    func addExpense(_ expense: PendingExpense, receipt: URL?) async throws {
        #if DEBUG
        if DemoBackend.isOn { return try await DemoBackend.addExpense(expense) }
        #endif
        if let receipt {
            do {
                try await client.storage.from("load-documents").upload(
                    expense.receiptPath,
                    fileURL: receipt,
                    options: FileOptions(contentType: "application/pdf", upsert: false)
                )
            } catch let error as StorageError where error.statusCode == "409" {
                // Uploaded on an earlier try that lost its connection.
            }
        }

        struct Params: Encodable {
            let target_load: UUID
            let kind: String
            let amount: Double
            let spent_on: String
            let note: String?
            let receipt_path: String?
            let receipt_name: String?
            let receipt_type: String?
            let client_id: UUID
            let paid_by: String
        }
        try await client.rpc("add_my_expense", params: Params(
            target_load: expense.loadID,
            kind: expense.kind.rawValue,
            amount: expense.amount,
            spent_on: expense.spentOn,
            note: expense.note,
            receipt_path: receipt == nil ? nil : expense.receiptPath,
            receipt_name: receipt == nil ? nil : "\(expense.kind.label) receipt \(expense.spentOn).pdf",
            receipt_type: receipt == nil ? nil : "application/pdf",
            client_id: expense.id,
            paid_by: expense.companyPaid == true ? "company" : "driver"
        )).execute()
    }

    /// The signed-in driver, once per carrier they drive for (usually one).
    func myProfile() async throws -> [DriverProfile] {
        #if DEBUG
        if DemoBackend.isOn { return try decode(DemoBackend.profileJSON()) }
        #endif
        return try await decode(client.rpc("my_profile").execute().data)
    }

    /// Sends a new CDL or medical card for the office to review. Uploads the
    /// PDF to the driver's from-driver folder, then records it. Nothing on
    /// the driver changes until the office accepts it.
    func sendCard(_ kind: CardKind, for profile: DriverProfile, expiresOn: String, pdf: Data) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.sendCard(kind, expiresOn: expiresOn) }
        #endif
        let path = "\(profile.organization.id.uuidString.lowercased())/\(profile.driverId.uuidString.lowercased())/from-driver/\(UUID().uuidString.lowercased()).pdf"
        try await client.storage.from("driver-documents").upload(
            path, data: pdf, options: FileOptions(contentType: "application/pdf", upsert: false)
        )
        struct Params: Encodable {
            let target_driver: UUID
            let kind: String
            let expires_on: String
            let path: String
            let file_name: String
            let content_type: String
            let size_bytes: Int
        }
        try await client.rpc("submit_my_driver_update", params: Params(
            target_driver: profile.driverId,
            kind: kind.rawValue,
            expires_on: expiresOn,
            path: path,
            file_name: "\(kind.title) from driver app.pdf",
            content_type: "application/pdf",
            size_bytes: pdf.count
        )).execute()
    }

    /// The driver's standard DQ file, once per carrier.
    func myDQFile() async throws -> [DQFile] {
        #if DEBUG
        if DemoBackend.isOn { return try decode(DemoBackend.dqFileJSON()) }
        #endif
        return try await decode(client.rpc("my_dq_file").execute().data)
    }

    /// Adds a document to a DQ item; it waits for the office to confirm.
    func uploadDQDocument(_ item: DQItem, in file: DQFile, pdf: Data) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.addDQUpload(item.id) }
        #endif
        let path = "\(file.organization.id.uuidString.lowercased())/\(file.driverId.uuidString.lowercased())/dq/\(UUID().uuidString.lowercased()).pdf"
        try await client.storage.from("dq-files").upload(
            path, data: pdf, options: FileOptions(contentType: "application/pdf", upsert: false)
        )
        struct Params: Encodable {
            let target_item: UUID
            let path: String
            let file_name: String
            let content_type: String
            let size_bytes: Int
        }
        try await client.rpc("add_my_dq_document", params: Params(
            target_item: item.id,
            path: path,
            file_name: "\(item.displayTitle.prefix(120)).pdf",
            content_type: "application/pdf",
            size_bytes: pdf.count
        )).execute()
    }

    /// Downloads a stored file to a temporary file for Quick Look.
    func downloadForPreview(bucket: String, path: String, name: String) async throws -> URL {
        #if DEBUG
        if DemoBackend.isOn { return try DemoBackend.samplePDF(named: name) }
        #endif
        let data = try await client.storage.from(bucket).download(path: path)
        let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let ext = (path as NSString).pathExtension
        let safeName = name.replacingOccurrences(of: "/", with: "-")
        let url = folder.appending(path: ext.isEmpty || safeName.hasSuffix(".\(ext)") ? safeName : "\(safeName).\(ext)")
        try data.write(to: url)
        return url
    }

    /// Takes back a CDL or medical card the office hasn't reviewed.
    func withdrawCard(_ update: DriverProfile.CardUpdate) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.withdrawCard(update.kind) }
        #endif
        try await client.rpc("withdraw_my_driver_update", params: ["update_id": update.id]).execute()
    }

    /// Removes paperwork the driver added, while the load is on the road.
    func removeLoadDocument(_ id: UUID) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.removeDocument(id) }
        #endif
        try await client.rpc("remove_my_load_document", params: ["target_document": id]).execute()
    }

    /// Removes an expense the driver added, while the load is on the road
    /// and before a paid pay statement covers it.
    func removeExpense(_ id: UUID) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.removeExpense(id) }
        #endif
        try await client.rpc("remove_my_expense", params: ["target_expense": id]).execute()
    }

    /// Takes back a DQ upload the office hasn't confirmed.
    func removeDQDocument(_ id: UUID) async throws {
        #if DEBUG
        if DemoBackend.isOn { return DemoBackend.removeDQUpload(id) }
        #endif
        try await client.rpc("remove_my_dq_document", params: ["target_document": id]).execute()
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
