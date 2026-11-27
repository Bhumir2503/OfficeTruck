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
    /// End of the last stop's window, if it has one (older servers leave it out).
    let deliveryEnd: String?
    let deliveredOn: String?
    let truck: String?
    let trailerNumber: String?
    let stopCount: Int
    let stopsDeparted: Int

    var isOnTheRoad: Bool { status.isOnTheRoad }

    /// The other loads still to drive whose time on the road overlaps each
    /// one's, with why: the office's check (`web/lib/dispatch-format.ts`),
    /// from the first appointment to the end of the last, compared as
    /// written. The office is warned, not stopped, so the driver hears it too.
    static func overlaps(in trips: [LoadSummary]) -> [UUID: [Overlap]] {
        let scheduled = trips.filter { $0.status == .dispatched || $0.status == .loaded }
        var result: [UUID: [Overlap]] = [:]
        for trip in scheduled {
            let found = scheduled.compactMap { other -> Overlap? in
                guard other.id != trip.id,
                      trip.windowStart < other.windowEnd, other.windowStart < trip.windowEnd else { return nil }
                return Overlap(load: trip, other: other)
            }
            if !found.isEmpty { result[trip.id] = found }
        }
        return result
    }

    var windowStart: Substring { pickupStart.prefix(16) }
    var windowEnd: Substring { (deliveryEnd ?? deliveryStart).prefix(16) }

    /// When it's due at the delivery: by the end of a window, or at the time.
    var deliveryDue: String {
        deliveryEnd.map { "by \(WallClock.format($0))" } ?? "on \(WallClock.format(deliveryStart))"
    }
}

/// Two loads on the road at once, said from one load's side: whichever
/// starts later picks up before the other delivers.
struct Overlap: Sendable {
    /// For the Trips row: "Picks up before QA-2002 delivers".
    let short: String
    /// For the load screen, with places and times.
    let long: String

    init(load: LoadSummary, other: LoadSummary) {
        if load.windowStart >= other.windowStart {
            short = "Picks up before \(other.reference) delivers"
            long = "This load picks up in \(load.pickupLocation) on \(WallClock.format(load.pickupStart)), "
                + "before \(other.reference) delivers in \(other.deliveryLocation) \(other.deliveryDue)."
        } else {
            short = "\(other.reference) picks up before this delivers"
            long = "\(other.reference) picks up in \(other.pickupLocation) on \(WallClock.format(other.pickupStart)), "
                + "before this load delivers in \(load.deliveryLocation) \(load.deliveryDue)."
        }
    }
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
    /// The truck's last odometer reading before this load, if it has one. A
    /// new reading can't be lower (the server checks too).
    let truckOdometer: Int?
    /// Hours a stop is free before detention starts; nil when not set.
    let detentionFreeHours: Double?
    /// The truck on the load, for the info sheet.
    let truckDetails: Truck?
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

    /// What a driver is asked for at a scale or an inspection. Dates are
    /// days as written ("2026-11-20").
    struct Truck: Decodable, Sendable {
        let unitNumber: String
        let year: Int?
        let make: String?
        let model: String?
        let vin: String?
        let plateNumber: String?
        let plateState: String?
        let odometer: Int?
        let odometerOn: String?
        /// When the annual inspection was last done; it's due a year later.
        let annualInspectionOn: String?
        let registrationExpiresOn: String?

        /// "2022 Freightliner Cascadia", or nil when none of it is known.
        var description: String? {
            let parts = [year.map(String.init), make, model].compactMap { $0 }
            return parts.isEmpty ? nil : parts.joined(separator: " ")
        }
    }

    /// The driver's pay on this load (locked when they were assigned).
    /// Worked out like the web (`web/lib/driver-format.ts`): per mile times
    /// the load's miles, or the flat amount. A percent is of the load's rate,
    /// which the app never reads, so it has no dollar figure.
    struct DriverPay: Decodable, Sendable {
        let type: String
        let rate: Double

        /// "$0.55 / mile", "25% of the load", "$500.00 / load".
        var label: String {
            switch type {
            case "per_mile": "\(rate.formatted(.currency(code: "USD").precision(.fractionLength(2...3)))) / mile"
            case "percent": "\(rate.formatted())% of the load"
            default: "\(rate.dollars) / load"
            }
        }

        /// What the load pays the driver, before deductions; nil for a
        /// percent, or per mile without miles.
        func amount(miles: Int?) -> Double? {
            switch type {
            case "per_mile": miles.map { rate * Double($0) }
            case "flat": rate
            default: nil
            }
        }
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
        /// The moment the appointment starts, once the office knows the
        /// stop's time zone. For the detention clock only: appointments are
        /// shown as written (`appointmentStart`).
        let appointmentAt: Date?
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

    /// Money the driver paid out of pocket on this load (or added
    /// themselves), owed back to them.
    struct Expense: Decodable, Identifiable, Sendable {
        let id: UUID
        let kind: String
        let amount: Double
        let spentOn: String
        let note: String?
        let receiptPath: String?
        let receiptType: String?
        /// The driver added it, so they can remove it. Missing from older
        /// servers.
        let mine: Bool?
        /// "driver" (paid back on their settlement) or "company" (a receipt
        /// for the office). Missing from older servers, which only sent the
        /// driver's.
        let paidBy: String?

        var companyPaid: Bool { paidBy == "company" }
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

/// `load_expenses.kind`.
enum ExpenseKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case fuel, tolls, scale, parking, lumper, repair, other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .fuel: "Fuel"
        case .tolls: "Tolls"
        case .scale: "Scale"
        case .parking: "Parking"
        case .lumper: "Lumper"
        case .repair: "Repair"
        case .other: "Other"
        }
    }

    var systemImage: String {
        switch self {
        case .fuel: "fuelpump"
        case .tolls: "road.lanes"
        case .scale: "scalemass"
        case .parking: "parkingsign"
        case .lumper: "shippingbox"
        case .repair: "wrench.and.screwdriver"
        case .other: "receipt"
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
    /// A new CDL or medical card the driver sent: waiting for the office,
    /// or declined in the last 30 days.
    let updates: [CardUpdate]

    func update(for kind: CardKind) -> CardUpdate? {
        updates.first { $0.kind == kind }
    }

    struct CardUpdate: Decodable, Sendable {
        let id: UUID
        let kind: CardKind
        /// The copy in driver-documents.
        let path: String
        /// "pending" or "declined".
        let status: String
        let expiresOn: String
        let reviewNote: String?
        let sentAt: Date

        var isPending: Bool { status == "pending" }
    }

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

/// The two cards a driver sends a new copy of from Profile.
enum CardKind: String, Decodable, Sendable, Identifiable {
    case cdl
    case medicalCard = "medical_card"

    var id: String { rawValue }

    /// "CDL", "Medical card".
    var title: String {
        switch self {
        case .cdl: "CDL"
        case .medicalCard: "Medical card"
        }
    }

    /// Mid-sentence: "CDL", "medical card".
    var name: String {
        switch self {
        case .cdl: "CDL"
        case .medicalCard: "medical card"
        }
    }
}

/// One carrier's standard DQ file for the signed-in driver, from
/// `my_dq_file()`.
struct DQFile: Decodable, Identifiable, Sendable {
    var id: UUID { driverId }
    let driverId: UUID
    let organization: Organization
    /// False until the office sets the driver's start date.
    let setUp: Bool
    let items: [DQItem]

    struct Organization: Decodable, Sendable {
        let id: UUID
        let name: String
    }
}

struct DQItem: Decodable, Identifiable, Sendable {
    let id: UUID
    let code: String
    let title: String
    let description: String?
    let licenseState: String?
    /// "yyyy-MM-dd".
    let dueDate: String?
    let completedAt: Date?
    let validUntil: String?
    let notApplicable: Bool
    /// An upload or signature is waiting for the office to confirm.
    let pendingReview: Bool
    /// Takes a document the driver can send.
    let canUpload: Bool
    /// What's on file for it, newest first (removed and replaced ones left out).
    let documents: [DQDocument]

    struct DQDocument: Decodable, Identifiable, Sendable {
        let id: UUID
        /// In dq-files.
        let path: String
        let fileName: String
        let createdAt: Date
        /// The office confirmed it; it's part of the record now.
        let confirmed: Bool
        /// The driver sent it from the app.
        let mine: Bool

        /// The driver's own, not yet confirmed: they can take it back.
        var canRemove: Bool { mine && !confirmed }
    }

    enum Status {
        case missing, pendingReview, complete, dueSoon, upcoming, overdue, notApplicable

        /// Needs the driver (or the office) to act now.
        var needsAttention: Bool { [.missing, .overdue, .dueSoon].contains(self) }
    }

    /// Worked out from the dates, as itemStatus() in web/lib/dq-rules.ts.
    func status(today: String) -> Status {
        if notApplicable { return .notApplicable }
        let soon = WallClock.adding(days: 30, to: today)
        if completedAt != nil {
            guard let validUntil else { return .complete }
            if validUntil < today { return .overdue }
            return validUntil <= soon ? .dueSoon : .complete
        }
        if pendingReview { return .pendingReview }
        guard let dueDate, dueDate != today else { return .missing }
        if dueDate < today { return .overdue }
        return dueDate <= soon ? .dueSoon : .upcoming
    }

    /// The title, with the state for per-state items ("… · TN").
    var displayTitle: String {
        licenseState.map { "\(title) · \($0)" } ?? title
    }
}
