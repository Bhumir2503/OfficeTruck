import SwiftUI

/// Something fetched from the server: still loading, here, or failed.
enum Loadable<Value> {
    case loading
    case loaded(Value)
    case failed(String)
}

/// Shows a Loadable: a spinner, the content, or the error with Try again.
struct LoadableView<Value, Content: View>: View {
    let value: Loadable<Value>
    let retry: () async -> Void
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch value {
        case .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .loaded(let loaded):
            content(loaded)
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await retry() } }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
        }
    }
}

extension Error {
    /// The server's message when it's one of ours, otherwise a plain one.
    var driverMessage: String {
        let text = (self as NSError).localizedDescription
        return text.isEmpty ? "Check your signal and try again." : text
    }
}
