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

/// Paperwork a driver can add to a load. Rate cons come from the office.
enum DocumentKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case bol, pod
    case lumperReceipt = "lumper_receipt"
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bol: "BOL"
        case .pod: "POD"
        case .lumperReceipt: "Lumper receipt"
        case .other: "Other"
        }
    }
}

/// One entry of `my_profile()`: the signed-in driver at one carrier.
struct DriverProfile: Decodable, Identifiable, Sendable {
    var id: UUID { driverId }
    let driverId: UUID
    let fullName: String
    let startDate: String?
    let organization: Organization
    let licenseClass: String?
    let cdlClass: String?
    let cdlState: String?
    let cdlNumberLast4: String?
    let cdlEndorsements: [String]
    let cdlRestrictions: String?
    /// "yyyy-MM-dd".
    let cdlExpiresOn: String?
    let medicalCardExpiresOn: String?
    let holdsMedicalVariance: Bool
    let payType: String?
    let payRate: Double?
    let payPeriod: String
    let truck: Truck?

    struct Organization: Decodable, Sendable {
        let id: UUID
        let name: String
        let phone: String?
    }

    struct Truck: Decodable, Sendable {
        let unitNumber: String
        let year: Int?
        let make: String?
        let model: String?
    }

    var licenseLabel: String {
        switch licenseClass {
        case "cdl": "CDL"
        case "clp": "CDL permit"
        case "non_cdl": "Non-CDL"
        default: "—"
        }
    }

    /// "$0.60 / mile", "25% of the load", "$350 per load".
    var payLabel: String? {
        guard let payType, let payRate else { return nil }
        switch payType {
        case "per_mile": return "\(payRate.formatted(.currency(code: "USD"))) / mile"
        case "percent": return "\(payRate.formatted())% of the load"
        case "flat": return "\(payRate.formatted(.currency(code: "USD"))) per load"
        default: return nil
        }
    }

    var payPeriodLabel: String {
        switch payPeriod {
        case "two_weeks": "Every 2 weeks"
        case "month": "Monthly"
        default: "Weekly"
        }
    }
}
