import Foundation

// Shapes returned by the driver RPCs in supabase/migrations/*_driver_app.sql.
// Stop and appointment times are wall-clock times at the stop
// ("2026-11-25T08:00:00", no zone), so they stay strings and are shown
// as written.

/// One row of `my_loads()`.
struct LoadSummary: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    let organizationName: String
    let reference: String
    let status: LoadStatus
    let pickupLocation: String
    let pickupStart: String
    let deliveryLocation: String
    let deliveryStart: String
    let deliveredOn: String?
    let truck: String?
    let trailerNumber: String?
    let stopCount: Int
    let stopsDeparted: Int

    var isOnTheRoad: Bool { status.isOnTheRoad }
}

/// `my_load(id)`.
struct LoadDetail: Decodable, Identifiable, Sendable {
    let id: UUID
    let reference: String
    let status: LoadStatus
    let canEdit: Bool
    let brokerName: String?
    let referenceNumbers: String?
    let equipment: String?
    let commodity: String?
    let weightLbs: Int?
    let trailerNumber: String?
    let notes: String?
    let miles: Int?
    let truck: String?
    let organization: Organization
    let driverPay: DriverPay?
    let stops: [Stop]
    let documents: [LoadDocument]
    let expenses: [Expense]

    struct Organization: Decodable, Sendable {
        let id: UUID
        let name: String
        let phone: String?
        let timeZone: String
    }

    struct DriverPay: Decodable, Sendable {
        let type: String
        let rate: Double
    }

    struct Stop: Decodable, Identifiable, Sendable {
        let id: UUID
        let position: Int
        let kind: String
        let facility: String?
        let location: String
        let appointmentType: String
        let appointmentStart: String
        let appointmentEnd: String?
        let stopNumber: String?
        let referenceNumbers: String?
        let contactPhone: String?
        let notes: String?
        let arrivedAt: Date?
        let departedAt: Date?
        let arrivedOdometer: Int?
        let departedOdometer: Int?

        var isPickup: Bool { kind == "pickup" }
    }

    struct LoadDocument: Decodable, Identifiable, Sendable {
        let id: UUID
        let kind: String
        let path: String
        let fileName: String
        let contentType: String
        let createdAt: Date
        let mine: Bool
    }

    struct Expense: Decodable, Identifiable, Sendable {
        let id: UUID
        let kind: String
        let amount: Double
        let spentOn: String
        let note: String?
    }
}

/// One row of `my_settlements()`.
struct SettlementSummary: Decodable, Identifiable, Sendable {
    let id: UUID
    let organizationName: String
    let periodStart: String
    let periodEnd: String
    let status: String
    let paidOn: String?
    let netPay: Double?
    let loadCount: Int

    var isPaid: Bool { status == "paid" }
}

enum LoadStatus: String, Decodable, Sendable {
    case dispatched, loaded, delivered, invoiced, paid, factored, tonu
    case other

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = LoadStatus(rawValue: raw) ?? .other
    }

    var isOnTheRoad: Bool { [.dispatched, .loaded, .delivered].contains(self) }

    var label: String {
        switch self {
        case .dispatched: "Dispatched"
        case .loaded: "In transit"
        case .delivered: "Delivered"
        case .invoiced, .paid, .factored: "Complete"
        case .tonu: "TONU"
        case .other: "—"
        }
    }
}
