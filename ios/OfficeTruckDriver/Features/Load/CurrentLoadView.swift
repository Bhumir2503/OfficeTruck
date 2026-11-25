import SwiftUI

/// The Load tab: the load on the road right now, or a note that there isn't one.
struct CurrentLoadView: View {
    @State private var detail: Loadable<LoadDetail?> = .loading
    private let api = DriverAPI()

    var body: some View {
        NavigationStack {
            LoadableView(value: detail, retry: load) { current in
                if let current {
                    LoadDetailContent(load: current)
                } else {
                    ContentUnavailableView(
                        "No load assigned",
                        systemImage: "shippingbox",
                        description: Text("When dispatch sends you a load, it shows up here.")
                    )
                }
            }
            .navigationTitle("Load")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            let loads = try await api.myLoads()
            if let onRoad = loads.first(where: \.isOnTheRoad) {
                detail = .loaded(try await api.myLoad(onRoad.id))
            } else {
                detail = .loaded(nil)
            }
        } catch {
            detail = .failed(error.driverMessage)
        }
    }
}

/// A load's stops and paperwork. Shared by the Load tab and Trips.
struct LoadDetailContent: View {
    let load: LoadDetail

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Load \(load.reference)").font(.title2.bold())
                        Spacer()
                        StatusBadge(status: load.status)
                    }
                    if let truck = load.truck {
                        Text("Truck \(truck)" + (load.trailerNumber.map { " · Trailer \($0)" } ?? ""))
                            .foregroundStyle(.secondary)
                    }
                    if let commodity = load.commodity {
                        Text(commodity + (load.weightLbs.map { " · \($0.formatted()) lbs" } ?? ""))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)

                if let phone = load.organization.phone,
                   let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) {
                        Label("Call dispatch", systemImage: "phone.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                }
            }

            Section("Stops") {
                ForEach(load.stops) { stop in
                    StopRow(stop: stop)
                }
            }

            if let notes = load.notes, !notes.isEmpty {
                Section("Notes") { Text(notes) }
            }

            Section("Paperwork") {
                if load.documents.isEmpty {
                    Text("No paperwork yet").foregroundStyle(.secondary)
                }
                ForEach(load.documents) { doc in
                    Label(doc.kind.documentLabel, systemImage: "doc.text")
                }
            }
        }
    }
}

struct StopRow: View {
    let stop: LoadDetail.Stop

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(stop.isPickup ? "Pickup" : "Delivery",
                  systemImage: stop.isPickup ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                .font(.caption.bold())
                .foregroundStyle(stop.isPickup ? .blue : .green)
            if let facility = stop.facility { Text(facility).font(.headline) }
            Text(stop.location)
            Text(appointment).foregroundStyle(.secondary)
            if let number = stop.stopNumber {
                Text("\(stop.isPickup ? "PU" : "DEL") # \(number)").font(.callout.monospaced())
            }
            if let departed = stop.departedAt {
                Label("Left \(departed.formatted(date: .omitted, time: .shortened))", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else if let arrived = stop.arrivedAt {
                Label("Arrived \(arrived.formatted(date: .omitted, time: .shortened))", systemImage: "clock.fill")
                    .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 4)
    }

    private var appointment: String {
        switch stop.appointmentType {
        case "tbd": "To be scheduled"
        case "window": "\(WallClock.format(stop.appointmentStart)) – \(stop.appointmentEnd.map(WallClock.format) ?? "")"
        default: WallClock.format(stop.appointmentStart)
        }
    }
}

struct StatusBadge: View {
    let status: LoadStatus

    var body: some View {
        Text(status.label)
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(color.opacity(0.18), in: .capsule)
            .foregroundStyle(color)
    }

    private var color: Color {
        switch status {
        case .dispatched: .blue
        case .loaded: .orange
        case .delivered: .green
        default: .secondary
        }
    }
}

extension String {
    var documentLabel: String {
        switch self {
        case "bol": "BOL"
        case "pod": "POD"
        case "lumper_receipt": "Lumper receipt"
        case "rate_con": "Rate confirmation"
        default: "Other"
        }
    }
}
