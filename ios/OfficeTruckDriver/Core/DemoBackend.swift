#if DEBUG
import Foundation

/// Sample data for trying the app in the simulator without a real SMS code
/// or server. Launch with the `-demo` argument (Debug builds only):
/// the driver is signed in and has one dispatched load.
enum DemoBackend {
    static let isOn = ProcessInfo.processInfo.arguments.contains("-demo")

    static let loadID = "11111111-0000-0000-0000-000000000001"
    private static let stopIDs = [
        "22222222-0000-0000-0000-000000000001",
        "22222222-0000-0000-0000-000000000002",
    ]
    /// Check-ins recorded this run, by stop id.
    nonisolated(unsafe) private static var arrived: [String: (Date, Int?)] = [:]
    nonisolated(unsafe) private static var departed: [String: (Date, Int?)] = [:]

    static func record(_ checkIn: PendingCheckIn) {
        let key = checkIn.stopID.uuidString.lowercased()
        switch checkIn.event {
        case .arrived: arrived[key] = (checkIn.tappedAt, checkIn.odometer)
        case .departed: departed[key] = (checkIn.tappedAt, checkIn.odometer)
        }
    }

    private static var status: String {
        if departed[stopIDs[1]] != nil { return "delivered" }
        if departed[stopIDs[0]] != nil { return "loaded" }
        return "dispatched"
    }

    static func loadsJSON() -> Data {
        Data("""
        [{"id": "\(loadID)", "organization_name": "Acme Freight", "reference": "QA-1004",
          "status": "\(status)", "pickup_location": "Memphis, TN", "pickup_start": "2026-11-25T08:00:00",
          "delivery_location": "Atlanta, GA", "delivery_start": "2026-11-26T14:00:00",
          "delivered_on": null, "truck": "T-101", "trailer_number": "53-220",
          "stop_count": 2, "stops_departed": \(departed.count)}]
        """.utf8)
    }

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
         "documents": [], "expenses": []}
        """.utf8)
    }

    static let settlementsJSON = """
    [{"id": "44444444-0000-0000-0000-000000000001", "organization_name": "Acme Freight",
      "period_start": "2026-11-16", "period_end": "2026-11-22", "status": "paid",
      "paid_on": "2026-11-24", "net_pay": 1384.20, "load_count": 3}]
    """
}
#endif
