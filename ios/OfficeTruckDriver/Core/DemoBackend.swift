#if DEBUG
import Foundation

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
          "truck": {"unit_number": "T-101", "year": 2022, "make": "Freightliner", "model": "Cascadia"}}\(twoCarriers ? """
        , {"driver_id": "55555555-0000-0000-0000-000000000002", "full_name": "Jordan Reyes",
          "start_date": "2026-06-15",
          "organization": {"id": "33333333-0000-0000-0000-000000000002", "name": "Bluegrass Haulers",
                           "phone": "(502) 555-0190"},
          "license_class": "cdl", "cdl_class": "A", "cdl_state": "TN", "cdl_number_last4": "5678",
          "cdl_endorsements": ["N", "T"], "cdl_restrictions": null,
          "cdl_expires_on": "\(day(400))", "medical_card_expires_on": "\(day(200))",
          "holds_medical_variance": false, "pay_type": "percent", "pay_rate": 25, "pay_period": "two_weeks",
          "truck": null}
        """ : "")]
        """.utf8)
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
