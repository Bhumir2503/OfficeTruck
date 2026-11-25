import Foundation

/// Stop times arrive as wall-clock strings ("2026-11-25T08:00:00"). Shown
/// as written, in the stop's own local time, never converted.
enum WallClock {
    private static let parser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return formatter
    }()

    private static let display: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.setLocalizedDateFormatFromTemplate("EEE MMM d, h:mm a")
        return formatter
    }()

    private static let dayOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let dayDisplay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.setLocalizedDateFormatFromTemplate("MMM d")
        return formatter
    }()

    static func format(_ text: String) -> String {
        guard let date = parser.date(from: String(text.prefix(19))) else { return text }
        return display.string(from: date)
    }

    /// "2026-11-16" → "Nov 16, 2026".
    static func fullDay(_ text: String) -> String {
        guard let date = dayOnly.date(from: text) else { return text }
        return fullDisplay.string(from: date)
    }

    private static let fullDisplay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    /// Days from today (on this phone) until a "yyyy-MM-dd" date; negative
    /// once it's past.
    static func daysUntil(_ text: String) -> Int? {
        guard let date = dayOnly.date(from: text) else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let today = Calendar.current.dateComponents([.year, .month, .day], from: .now)
        guard let todayUTC = utc.date(from: today) else { return nil }
        return utc.dateComponents([.day], from: todayUTC, to: date).day
    }

    /// Today on this phone, "yyyy-MM-dd".
    static func today() -> String {
        string(from: .now)
    }

    /// A day picked on this phone (a DatePicker's value) as "yyyy-MM-dd".
    static func string(from date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// "2026-11-16" plus 30 days → "2026-12-16".
    static func adding(days: Int, to text: String) -> String {
        guard let date = dayOnly.date(from: text) else { return text }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        guard let later = utc.date(byAdding: .day, value: days, to: date) else { return text }
        return dayOnly.string(from: later)
    }

    /// "2026-11-16" → "Nov 16".
    static func day(_ text: String) -> String {
        guard let date = dayOnly.date(from: text) else { return text }
        return dayDisplay.string(from: date)
    }
}

extension Double {
    var dollars: String { formatted(.currency(code: "USD")) }
}
