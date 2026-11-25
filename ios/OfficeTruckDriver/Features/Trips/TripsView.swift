import SwiftUI

/// The app's one main screen: every load sent to the driver, the ones on
/// the road first. Tap a trip to work it. Profile and Pay open from the
/// toolbar.
struct TripsView: View {
    @State private var loads: Loadable<[LoadSummary]> = .loading
    @State private var showingProfile = false
    @State private var showingPay = false
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
                    List {
                        if !onRoad.isEmpty {
                            Section("On the road") {
                                ForEach(onRoad) { trip in tripRow(trip) }
                            }
                        }
                        if !past.isEmpty {
                            Section("Past") {
                                ForEach(past) { trip in tripRow(trip) }
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
                ToolbarItem(placement: .topBarLeading) {
                    Button("Profile", systemImage: "person.crop.circle") { showingProfile = true }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Pay", systemImage: "dollarsign.circle") { showingPay = true }
                }
            }
            .sheet(isPresented: $showingProfile) { MeView() }
            .sheet(isPresented: $showingPay) { PayView() }
            .task(id: queue.deliveredCount) { await fetch() }
        }
    }

    private func tripRow(_ trip: LoadSummary) -> some View {
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

    private func fetch() async {
        do {
            loads = .loaded(try await api.myLoads())
        } catch {
            if case .loaded = loads { return }
            loads = .failed(error.driverMessage)
        }
    }
}
