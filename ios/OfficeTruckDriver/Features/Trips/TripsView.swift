import SwiftUI

/// Every load sent to the driver: on the road first, then the last 120 days.
struct TripsView: View {
    @State private var loads: Loadable<[LoadSummary]> = .loading
    private let api = DriverAPI()

    var body: some View {
        NavigationStack {
            LoadableView(value: loads, retry: load) { loads in
                if loads.isEmpty {
                    ContentUnavailableView("No trips yet", systemImage: "list.bullet.rectangle")
                } else {
                    List(loads) { trip in
                        NavigationLink(value: trip) { TripRow(trip: trip) }
                    }
                }
            }
            .navigationTitle("Trips")
            .navigationDestination(for: LoadSummary.self) { TripDetailView(id: $0.id) }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            loads = .loaded(try await api.myLoads())
        } catch {
            loads = .failed(error.driverMessage)
        }
    }
}

struct TripRow: View {
    let trip: LoadSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(trip.reference).font(.headline)
                Spacer()
                StatusBadge(status: trip.status)
            }
            Text("\(trip.pickupLocation) → \(trip.deliveryLocation)")
            Text(WallClock.format(trip.pickupStart)).font(.callout).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct TripDetailView: View {
    let id: UUID
    @State private var detail: Loadable<LoadDetail> = .loading
    private let api = DriverAPI()

    var body: some View {
        LoadableView(value: detail, retry: load) { LoadDetailContent(load: $0) }
            .navigationTitle("Load")
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
    }

    private func load() async {
        do {
            detail = .loaded(try await api.myLoad(id))
        } catch {
            detail = .failed(error.driverMessage)
        }
    }
}
