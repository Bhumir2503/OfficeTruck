import SwiftUI

/// The app's one main screen: every load sent to the driver, in three
/// groups. Today: loads in transit, dispatched ones picking up today or
/// overdue, and ones delivered today. Upcoming: dispatched loads that pick
/// up on a later day. Past: everything else, newest first; a delivered load
/// still waiting on the office can be opened there to add paperwork.
/// Tap a trip to work it. Pay and Profile open as pages
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
                    // Pickup days compare as written ("2026-11-26"), never
                    // converted to the phone's time zone.
                    let today = WallClock.today()
                    let isUpcoming = { (trip: LoadSummary) in
                        trip.status == .dispatched && String(trip.pickupStart.prefix(10)) > today
                    }
                    let isToday = { (trip: LoadSummary) in
                        switch trip.status {
                        case .loaded: true
                        case .dispatched: !isUpcoming(trip)
                        case .delivered: (trip.deliveredOn ?? String(trip.deliveryStart.prefix(10))) >= today
                        default: false
                        }
                    }
                    let current = trips.filter(isToday).sorted { $0.pickupStart < $1.pickupStart }
                    let upcoming = trips.filter(isUpcoming).sorted { $0.pickupStart < $1.pickupStart }
                    let past = trips.filter { !isToday($0) && !isUpcoming($0) }
                        .sorted { $0.pickupStart > $1.pickupStart }
                    let showsCarrier = Set(trips.map(\.organizationName)).count > 1
                    List {
                        if !current.isEmpty {
                            Section("Today") {
                                ForEach(current) { trip in tripRow(trip, showsCarrier: showsCarrier) }
                            }
                        }
                        if !upcoming.isEmpty {
                            Section("Upcoming") {
                                ForEach(upcoming) { trip in tripRow(trip, showsCarrier: showsCarrier) }
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
