#if DEBUG
import Foundation
import UIKit

/// Sample data for trying the app in the simulator without a real SMS code
/// or server. Launch with the `-demo` argument (Debug builds only):
/// the driver is signed in and has one dispatched load.
enum DemoBackend {
    static let isOn = ProcessInfo.processInfo.arguments.contains("-demo")
    /// Add `-two-carriers` too to see a driver who drives for two companies.
    static let twoCarriers = ProcessInfo.processInfo.arguments.contains("-two-carriers")
    /// Add `-signed-out` too to start at sign-in. No text is sent; any
    /// 6-digit code signs in.
    static let startsSignedOut = ProcessInfo.processInfo.arguments.contains("-signed-out")

    static let loadID = "11111111-0000-0000-0000-000000000001"
    private static let stopIDs = [
        "22222222-0000-0000-0000-000000000001",
        "22222222-0000-0000-0000-000000000002",
    ]
    /// Check-ins recorded this run, by stop id.
    nonisolated(unsafe) private static var arrived: [String: (Date, Int?)] = [:]
    nonisolated(unsafe) private static var departed: [String: (Date, Int?)] = [:]

    /// Documents added this run.
    nonisolated(unsafe) private static var documents: [PendingDocument] = []

    /// CDL and medical cards sent this run: kind → expiration date.
    nonisolated(unsafe) private static var sentCards: [CardKind: String] = [:]
    /// DQ items given an upload this run.
    /// DQ items given an upload this run: item → document.
    nonisolated(unsafe) private static var dqUploads: [UUID: UUID] = [:]

    static func sendCard(_ kind: CardKind, expiresOn: String) {
        sentCards[kind] = expiresOn
    }

    static func addDQUpload(_ item: UUID) {
        dqUploads[item] = UUID()
    }

    static func removeDQUpload(_ document: UUID) {
        dqUploads = dqUploads.filter { $0.value != document }
    }

    static func withdrawCard(_ kind: CardKind) {
        sentCards[kind] = nil
    }

    static func removeDocument(_ id: UUID) {
        documents.removeAll { $0.id == id }
    }

    /// A one-page PDF standing in for a stored file, for Quick Look.
    static func samplePDF(named name: String) throws -> URL {
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let data = UIGraphicsPDFRenderer(bounds: page).pdfData { context in
            context.beginPage()
            let text = "\(name)\n\nDemo copy. In the real app this is the file that was uploaded."
            text.draw(in: page.insetBy(dx: 54, dy: 72), withAttributes: [.font: UIFont.systemFont(ofSize: 20)])
        }
        let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appending(path: name.hasSuffix(".pdf") ? name : "\(name).pdf")
        try data.write(to: url)
        return url
    }

    private static var updatesJSON: String {
        let sent = Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(.now)
        let rows = sentCards.map { kind, expires in
            """
            {"id": "77777777-0000-0000-0000-00000000000\(kind == .cdl ? 1 : 2)", "path": "demo/\(kind.rawValue).pdf",
             "kind": "\(kind.rawValue)", "status": "pending", "expires_on": "\(expires)", "review_note": null, "sent_at": "\(sent)"}
            """
        }
        return "[" + rows.joined(separator: ",") + "]"
    }

    static func addDocument(_ document: PendingDocument) {
        documents.append(document)
    }

    static func record(_ checkIn: PendingCheckIn) {
        let key = checkIn.stopID.uuidString.lowercased()
        switch checkIn.event {
        case .arrived: arrived[key] = (checkIn.tappedAt, checkIn.odometer)
        case .departed: departed[key] = (checkIn.tappedAt, checkIn.odometer)
        }
    }

    /// Like the server: a POD or leaving the last stop is delivered, a BOL
    /// or leaving the last pickup is loaded.
    private static var status: String {
        if departed[stopIDs[1]] != nil || documents.contains(where: { $0.kind == .pod }) { return "delivered" }
        if departed[stopIDs[0]] != nil || documents.contains(where: { $0.kind == .bol }) { return "loaded" }
        return "dispatched"
    }

    private static var documentsJSON: String {
        let rows = documents.map { doc in
            """
            {"id": "\(doc.id.uuidString.lowercased())", "kind": "\(doc.kind.rawValue)", "path": "\(doc.storagePath)",
             "file_name": "\(doc.fileName)", "content_type": "application/pdf", "size_bytes": \(doc.sizeBytes),
             "created_at": "\(Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(doc.createdAt))", "mine": true}
            """
        }
        return "[" + rows.joined(separator: ",") + "]"
    }

    static func loadsJSON() -> Data {
        Data("""
        [{"id": "\(loadID)", "organization_name": "Acme Freight", "reference": "QA-1004",
          "status": "\(status)", "pickup_location": "Memphis, TN", "pickup_start": "2026-11-25T08:00:00",
          "delivery_location": "Atlanta, GA", "delivery_start": "2026-11-26T14:00:00",
          "delivered_on": null, "truck": "T-101", "trailer_number": "53-220",
          "stop_count": 2, "stops_departed": \(departed.count)}\(twoCarriers ? secondCarrierLoad : "")]
        """.utf8)
    }

    private static let secondCarrierLoad = """
    , {"id": "11111111-0000-0000-0000-000000000002", "organization_name": "Bluegrass Haulers", "reference": "BG-310",
       "status": "delivered", "pickup_location": "Louisville, KY", "pickup_start": "2026-11-20T06:00:00",
       "delivery_location": "Nashville, TN", "delivery_start": "2026-11-20T13:00:00",
       "delivered_on": "2026-11-20", "truck": "B-7", "trailer_number": null,
       "stop_count": 2, "stops_departed": 2}
    """

    static func loadJSON() -> Data {
        func time(_ value: (Date, Int?)?) -> String {
            value.map { "\"\(Date.ISO8601FormatStyle(includingFractionalSeconds: true).format($0.0))\"" } ?? "null"
        }
        func odometer(_ value: (Date, Int?)?) -> String {
            value?.1.map(String.init) ?? "null"
        }
        let a0 = arrived[stopIDs[0]], d0 = departed[stopIDs[0]]
        let a1 = arrived[stopIDs[1]], d1 = departed[stopIDs[1]]
        return Data("""
        {"id": "\(loadID)", "reference": "QA-1004", "status": "\(status)", "can_edit": true,
         "broker_name": "QA Test Broker", "reference_numbers": "PO 88123", "equipment": "dry_van",
         "commodity": "Paper goods", "weight_lbs": 38000, "trailer_number": "53-220",
         "notes": "Check in at the guard shack. No overnight parking.", "miles": 382, "truck": "T-101",
         "organization": {"id": "33333333-0000-0000-0000-000000000001", "name": "Acme Freight",
                          "phone": "(901) 555-0142", "time_zone": "America/Chicago"},
         "driver_pay": {"type": "per_mile", "rate": 0.6},
         "stops": [
           {"id": "\(stopIDs[0])", "position": 1, "kind": "pickup", "facility": "Riverside Paper DC",
            "location": "Memphis, TN", "appointment_type": "appointment",
            "appointment_start": "2026-11-25T08:00:00", "appointment_end": null,
            "stop_number": "PU-55821", "reference_numbers": null, "contact_phone": "(901) 555-0188",
            "notes": null, "arrived_at": \(time(a0)), "departed_at": \(time(d0)),
            "arrived_odometer": \(odometer(a0)), "departed_odometer": \(odometer(d0))},
           {"id": "\(stopIDs[1])", "position": 2, "kind": "delivery", "facility": "Peachtree Grocers",
            "location": "Atlanta, GA", "appointment_type": "window",
            "appointment_start": "2026-11-26T14:00:00", "appointment_end": "2026-11-26T18:00:00",
            "stop_number": "DEL-7741", "reference_numbers": null, "contact_phone": null,
            "notes": "Dock 4", "arrived_at": \(time(a1)), "departed_at": \(time(d1)),
            "arrived_odometer": \(odometer(a1)), "departed_odometer": \(odometer(d1))}
         ],
         "documents": \(documentsJSON), "expenses": []}
        """.utf8)
    }

    /// The CDL is good for a year; the medical card runs out in 20 days, so
    /// the warning shows.
    static func profileJSON() -> Data {
        func day(_ offset: Int) -> String {
            Calendar.current.date(byAdding: .day, value: offset, to: .now)!
                .formatted(.iso8601.year().month().day())
        }
        return Data("""
        [{"driver_id": "55555555-0000-0000-0000-000000000001", "full_name": "Jordan Reyes",
          "start_date": "2025-03-01",
          "organization": {"id": "33333333-0000-0000-0000-000000000001", "name": "Acme Freight",
                           "phone": "(901) 555-0142"},
          "license_class": "cdl", "cdl_class": "A", "cdl_state": "TN", "cdl_number_last4": "5678",
          "cdl_endorsements": ["H", "N", "T"], "cdl_restrictions": null,
          "cdl_expires_on": "\(day(400))", "medical_card_expires_on": "\(day(20))",
          "holds_medical_variance": false, "pay_type": "per_mile", "pay_rate": 0.6, "pay_period": "week",
          "truck": {"unit_number": "T-101", "year": 2022, "make": "Freightliner", "model": "Cascadia"},
          "updates": \(updatesJSON)}\(twoCarriers ? """
        , {"driver_id": "55555555-0000-0000-0000-000000000002", "full_name": "Jordan Reyes",
          "start_date": "2026-06-15",
          "organization": {"id": "33333333-0000-0000-0000-000000000002", "name": "Bluegrass Haulers",
                           "phone": "(502) 555-0190"},
          "license_class": "cdl", "cdl_class": "A", "cdl_state": "TN", "cdl_number_last4": "5678",
          "cdl_endorsements": ["N", "T"], "cdl_restrictions": null,
          "cdl_expires_on": "\(day(400))", "medical_card_expires_on": "\(day(200))",
          "holds_medical_variance": false, "pay_type": "percent", "pay_rate": 25, "pay_period": "two_weeks",
          "truck": null, "updates": []}
        """ : "")]
        """.utf8)
    }

    /// One of each status: done, waiting for the office, expiring soon,
    /// coming up, and one the driver needs to send.
    static func dqFileJSON() -> Data {
        func day(_ offset: Int) -> String {
            Calendar.current.date(byAdding: .day, value: offset, to: .now)!
                .formatted(.iso8601.year().month().day())
        }
        let done = "\"\(Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(.now.addingTimeInterval(-86400 * 200)))\""
        func item(_ n: Int, _ code: String, _ title: String, due: String?, completed: Bool, validUntil: String?,
                  canUpload: Bool, state: String? = nil, description: String? = nil) -> String {
            let id = "66666666-0000-0000-0000-00000000000\(n)"
            let upload = dqUploads[UUID(uuidString: id)!]
            let pending = !completed && upload != nil
            let stamp = Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(.now)
            var docs: [String] = []
            if let upload {
                docs.append("""
                {"id": "\(upload.uuidString.lowercased())", "path": "demo/\(code).pdf", "file_name": "Sent from the app.pdf",
                 "created_at": "\(stamp)", "confirmed": false, "mine": true}
                """)
            }
            if completed {
                docs.append("""
                {"id": "88888888-0000-0000-0000-00000000000\(n)", "path": "demo/\(code)-office.pdf", "file_name": "On file.pdf",
                 "created_at": \(done), "confirmed": true, "mine": false}
                """)
            }
            return """
            {"id": "\(id)", "code": "\(code)", "title": "\(title)",
             "description": \(description.map { "\"\($0)\"" } ?? "null"),
             "license_state": \(state.map { "\"\($0)\"" } ?? "null"),
             "due_date": \(due.map { "\"\($0)\"" } ?? "null"), "completed_at": \(completed ? done : "null"),
             "valid_until": \(validUntil.map { "\"\($0)\"" } ?? "null"), "not_applicable": false,
             "pending_review": \(pending || code == "employment_application"), "can_upload": \(canUpload),
             "documents": [\(docs.joined(separator: ","))]}
            """
        }
        let items = [
            item(1, "employment_application", "Employment application, signed and dated", due: day(-200), completed: false,
                 validUntil: nil, canUpload: false, description: "Filled in and signed by the driver."),
            item(2, "hire_mvr", "Driving record (MVR) from each state that licensed the driver in the past 3 years",
                 due: day(-170), completed: true, validUntil: nil, canUpload: true, state: "TN"),
            item(3, "road_test", "Road test certificate, or a copy of the CDL accepted in its place",
                 due: nil, completed: false, validUntil: nil, canUpload: true),
            item(4, "medical_proof_cdl", "Medical proof: MVR showing current medical certification status",
                 due: day(-200), completed: true, validUntil: day(20), canUpload: true,
                 description: "For CDL and CLP holders. Due again when the certification runs out."),
            item(5, "annual_mvr", "Annual driving record (MVR)", due: day(165), completed: false, validUntil: nil, canUpload: true),
        ]
        var files = ["""
        {"driver_id": "55555555-0000-0000-0000-000000000001",
         "organization": {"id": "33333333-0000-0000-0000-000000000001", "name": "Acme Freight"},
         "set_up": true, "items": [\(items.joined(separator: ","))]}
        """]
        if twoCarriers {
            files.append("""
            {"driver_id": "55555555-0000-0000-0000-000000000002",
             "organization": {"id": "33333333-0000-0000-0000-000000000002", "name": "Bluegrass Haulers"},
             "set_up": false, "items": []}
            """)
        }
        return Data(("[" + files.joined(separator: ",") + "]").utf8)
    }

    static var settlementsJSON: String { """
    [{"id": "44444444-0000-0000-0000-000000000001", "organization_name": "Acme Freight",
      "period_start": "2026-11-16", "period_end": "2026-11-22", "status": "paid",
      "paid_on": "2026-11-24", "net_pay": 1384.20, "load_count": 3}\(twoCarriers ? """
    , {"id": "44444444-0000-0000-0000-000000000002", "organization_name": "Bluegrass Haulers",
      "period_start": "2026-11-09", "period_end": "2026-11-22", "status": "paid",
      "paid_on": "2026-11-25", "net_pay": 612.50, "load_count": 1}
    """ : "")]
    """ }
}
#endif
