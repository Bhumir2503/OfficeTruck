import SwiftUI

/// The Load tab: the load on the road right now, or a note that there isn't one.
struct CurrentLoadView: View {
    @State private var current: Loadable<UUID?> = .loading
    private let queue = OfflineQueue.shared
    private let api = DriverAPI()

    var body: some View {
        NavigationStack {
            Group {
                switch current {
                case .loading:
                    ProgressView()
                case .failed(let message):
                    ContentUnavailableView {
                        Label("Couldn't load", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(message)
                    } actions: {
                        Button("Try again") { Task { await fetch() } }
                            .buttonStyle(.borderedProminent)
                    }
                case .loaded(.some(let id)):
                    LoadScreen(loadID: id)
                case .loaded(.none):
                    ContentUnavailableView(
                        "No load assigned",
                        systemImage: "shippingbox",
                        description: Text("When dispatch sends you a load, it shows up here.")
                    )
                    .refreshable { await fetch() }
                }
            }
            .navigationTitle("Load")
            .task(id: queue.deliveredCount) { await fetch() }
        }
    }

    private func fetch() async {
        do {
            current = .loaded(try await api.myLoads().first(where: \.isOnTheRoad)?.id)
        } catch {
            if case .loaded = current { return }
            current = .failed(error.driverMessage)
        }
    }
}
