import SwiftUI

/// Every load sent to the driver: on the road first, then the last 120 days.
struct TripsView: View {
    @State private var loads: Loadable<[LoadSummary]> = .loading
    private let api = DriverAPI()

    var body: some View {
        NavigationStack {
            Group {
                switch loads {
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
                case .loaded(let trips) where trips.isEmpty:
                    ContentUnavailableView("No trips yet", systemImage: "list.bullet.rectangle")
                case .loaded(let trips):
                    List(trips) { trip in
                        NavigationLink(value: trip.id) {
                            VStack(alignment: .leading) {
                                LabeledContent(trip.reference, value: trip.status.label)
                                    .font(.headline)
                                Text("\(trip.pickupLocation) → \(trip.deliveryLocation)")
                                Text(WallClock.format(trip.pickupStart))
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .refreshable { await fetch() }
                }
            }
            .navigationTitle("Trips")
            .navigationDestination(for: UUID.self) { id in
                LoadScreen(loadID: id)
                    .navigationTitle("Load")
                    .navigationBarTitleDisplayMode(.inline)
            }
            .task { await fetch() }
        }
    }

    private func fetch() async {
        do {
            loads = .loaded(try await api.myLoads())
        } catch {
            loads = .failed(error.driverMessage)
        }
    }
}
