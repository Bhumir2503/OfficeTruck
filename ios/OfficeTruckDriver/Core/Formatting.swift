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

    /// "2026-11-16" → "Nov 16".
    static func day(_ text: String) -> String {
        guard let date = dayOnly.date(from: text) else { return text }
        return dayDisplay.string(from: date)
    }
}

extension Double {
    var dollars: String { formatted(.currency(code: "USD")) }
}
