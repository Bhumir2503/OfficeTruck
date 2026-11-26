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
    /// Load number, city or carrier to find a trip by.
    @State private var search = ""
    @State private var searching = false
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
                case .loaded(let all):
                    let trips = filtered(all)
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
                    let showsCarrier = Set(all.map(\.organizationName)).count > 1
                    let overlaps = LoadSummary.overlaps(in: all)
                    List {
                        if trips.isEmpty {
                            ContentUnavailableView.search(text: search)
                        }
                        if !current.isEmpty {
                            Section("Today") {
                                ForEach(current) { trip in tripRow(trip, showsCarrier: showsCarrier, overlaps: overlaps[trip.id] ?? []) }
                            }
                        }
                        if !upcoming.isEmpty {
                            Section("Upcoming") {
                                ForEach(upcoming) { trip in tripRow(trip, showsCarrier: showsCarrier, overlaps: overlaps[trip.id] ?? []) }
                            }
                        }
                        if !past.isEmpty {
                            Section("Past") {
                                ForEach(past) { trip in tripRow(trip, showsCarrier: showsCarrier, overlaps: overlaps[trip.id] ?? []) }
                            }
                        }
                    }
                    .refreshable { await fetch() }
                }
            }
            .navigationTitle("Trips")
            // Closed (text kept) when a load opens: a load opened from an
            // active search loses its title otherwise.
            .searchable(text: $search, isPresented: $searching, prompt: "Load #, city or carrier")
            .navigationDestination(for: UUID.self) { id in
                LoadScreen(loadID: id, overlaps: overlaps[id] ?? [])
                    .onAppear { searching = false }
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

    /// Other loads at the same time as each one, by load.
    private var overlaps: [UUID: [Overlap]] {
        if case .loaded(let trips) = loads { LoadSummary.overlaps(in: trips) } else { [:] }
    }

    /// The carrier's name shows only for drivers who drive for more than one.
    /// A load at the same time as another says which, in orange.
    private func tripRow(_ trip: LoadSummary, showsCarrier: Bool, overlaps: [Overlap]) -> some View {
        NavigationLink(value: trip.id) {
            VStack(alignment: .leading) {
                LabeledContent(trip.reference, value: trip.status.label)
                    .font(.headline)
                Text("\(trip.pickupLocation) → \(trip.deliveryLocation)")
                Text(showsCarrier ? "\(trip.organizationName) · \(when(trip))" : when(trip))
                    .font(.callout)
                    .foregroundStyle(.secondary)
                if !overlaps.isEmpty {
                    // Icon inline, so the line stays flush with the ones above.
                    Text("\(Image(systemName: "exclamationmark.triangle.fill")) \(overlaps.map(\.short).joined(separator: "; "))")
                        .font(.callout)
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    /// What's next for the trip: when it picks up, when it delivers (with
    /// the stop it's on, past two stops), or the day it was delivered.
    private func when(_ trip: LoadSummary) -> String {
        switch trip.status {
        case .loaded:
            let progress = trip.stopCount > 2
                ? " · Stop \(min(trip.stopsDeparted + 1, trip.stopCount)) of \(trip.stopCount)" : ""
            return "Delivers \(WallClock.format(trip.deliveryStart))\(progress)"
        case .delivered, .invoiced, .paid, .factored:
            return "Delivered \(WallClock.day(trip.deliveredOn ?? String(trip.deliveryStart.prefix(10))))"
        default:
            return "Picks up \(WallClock.format(trip.pickupStart))"
        }
    }

    /// Trips matching the search: load number, either city, or carrier.
    private func filtered(_ trips: [LoadSummary]) -> [LoadSummary] {
        let text = search.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return trips }
        return trips.filter { trip in
            [trip.reference, trip.pickupLocation, trip.deliveryLocation, trip.organizationName]
                .contains { $0.localizedCaseInsensitiveContains(text) }
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
