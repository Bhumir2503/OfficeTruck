import Foundation

/// Something fetched from the server: still loading, here, or failed.
enum Loadable<Value> {
    case loading
    case loaded(Value)
    case failed(String)
}

extension Error {
    /// The server's message when it's one of ours, otherwise a plain one.
    var driverMessage: String {
        let text = (self as NSError).localizedDescription
        return text.isEmpty ? "Check your signal and try again." : text
    }
}
