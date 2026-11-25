import SwiftUI

/// The app's one main screen: every load sent to the driver, the ones on
/// the road first. Tap a trip to work it. Pay and Profile open as pages
/// from the toolbar.
struct TripsView: View {
    @State private var loads: Loadable<[LoadSummary]> = .loading
    private let queue = OfflineQueue.shared
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
                    ContentUnavailableView(
                        "No trips yet",
                        systemImage: "truck.box",
                        description: Text("When dispatch sends you a load, it shows up here.")
                    )
                    .refreshable { await fetch() }
                case .loaded(let trips):
                    let onRoad = trips.filter(\.isOnTheRoad)
                    let past = trips.filter { !$0.isOnTheRoad }
                    let showsCarrier = Set(trips.map(\.organizationName)).count > 1
                    List {
                        if !onRoad.isEmpty {
                            Section("On the road") {
                                ForEach(onRoad) { trip in tripRow(trip, showsCarrier: showsCarrier) }
                            }
                        }
                        if !past.isEmpty {
                            Section("Past") {
                                ForEach(past) { trip in tripRow(trip, showsCarrier: showsCarrier) }
                            }
                        }
                    }
                    .refreshable { await fetch() }
                }
            }
            .navigationTitle("Trips")
            .navigationDestination(for: UUID.self) { id in
                LoadScreen(loadID: id)
            }
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    NavigationLink { PayView() } label: {
                        Label("Pay", systemImage: "dollarsign")
                    }
                    NavigationLink { MeView() } label: {
                        Label("Profile", systemImage: "person")
                    }
                }
            }
            .task(id: queue.deliveredCount) { await fetch() }
        }
    }

    /// The carrier's name shows only for drivers who drive for more than one.
    private func tripRow(_ trip: LoadSummary, showsCarrier: Bool) -> some View {
        NavigationLink(value: trip.id) {
            VStack(alignment: .leading) {
                LabeledContent(trip.reference, value: trip.status.label)
                    .font(.headline)
                Text("\(trip.pickupLocation) → \(trip.deliveryLocation)")
                Text(showsCarrier ? "\(trip.organizationName) · \(WallClock.format(trip.pickupStart))"
                                  : WallClock.format(trip.pickupStart))
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func fetch() async {
        do {
            loads = .loaded(try await api.myLoads())
        } catch {
            if case .loaded = loads { return }
            loads = .failed(error.driverMessage)
        }
    }
}
