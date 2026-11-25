import SwiftUI

/// One load: its details, stops and paperwork. On a load that's on the road,
/// the next stop has an Arrived or Departed button.
struct LoadScreen: View {
    let loadID: UUID

    @State private var load: Loadable<LoadDetail> = .loading
    @State private var checkIn: CheckInRequest?
    @State private var odometer = ""
    private let queue = OfflineQueue.shared
    private let api = DriverAPI()

    var body: some View {
        Group {
            switch load {
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
            case .loaded(let load):
                details(load)
            }
        }
        .task(id: queue.deliveredCount) { await fetch() }
        .alert(
            checkIn.map { "\($0.event == .arrived ? "Arrived at" : "Leaving") \($0.place)?" } ?? "",
            isPresented: Binding(get: { checkIn != nil }, set: { if !$0 { checkIn = nil } }),
            presenting: checkIn
        ) { request in
            if request.asksOdometer {
                TextField("Odometer (optional)", text: $odometer)
                    .keyboardType(.numberPad)
            }
            Button("Cancel", role: .cancel) {}
            Button(request.event == .arrived ? "Arrived" : "Departed") { record(request) }
        } message: { _ in
            Text("This records \(Date.now.formatted(date: .omitted, time: .shortened)). Only dispatch can change it after.")
        }
        .alert(
            "Check-in not saved",
            isPresented: Binding(get: { !queue.rejections.isEmpty }, set: { if !$0 { queue.rejections.removeAll() } })
        ) {
            Button("OK") {}
        } message: {
            Text((queue.rejections.first ?? "") + " Call dispatch to fix the time.")
        }
    }

    private func details(_ load: LoadDetail) -> some View {
        let pending = queue.checkIns(for: load.id)
        let next = nextStop(load, pending: pending)

        return List {
            ForEach(load.stops) { stop in
                let arrived = stop.arrivedAt ?? pending.first { $0.stopID == stop.id && $0.event == .arrived }?.tappedAt
                let departed = stop.departedAt ?? pending.first { $0.stopID == stop.id && $0.event == .departed }?.tappedAt
                let waiting = pending.contains { $0.stopID == stop.id }
                let isNext = load.canEdit && stop.id == next?.id

                Section {
                    VStack(alignment: .leading) {
                        Text(stop.facility ?? stop.location).font(.headline)
                        if stop.facility != nil { Text(stop.location).foregroundStyle(.secondary) }
                    }
                    LabeledContent("Appointment", value: appointment(stop))
                    if let number = stop.stopNumber {
                        LabeledContent(stop.isPickup ? "Pickup #" : "Delivery #", value: number)
                    }
                    if let phone = stop.contactPhone, let url = URL(string: "tel:\(phone.filter(\.isNumber))") {
                        LabeledContent("Phone") { Link(phone, destination: url) }
                    }
                    if let notes = stop.notes { Text(notes).foregroundStyle(.secondary) }
                    ForEach([StopEvent.arrived, .departed], id: \.self) { event in
                        let time = event == .arrived ? arrived : departed
                        // The one row waiting on the driver: the next stop's
                        // arrival, or its departure once they've arrived.
                        let actionable = isNext && time == nil && (event == .arrived || arrived != nil)
                        LabeledContent(event == .arrived ? "Arrived" : "Departed") {
                            if let time {
                                Text(time.formatted(date: .omitted, time: .shortened))
                            } else if actionable {
                                prominent(Button(event == .arrived ? "Check in" : "Check out") {
                                    odometer = ""
                                    checkIn = CheckInRequest(
                                        loadID: load.id,
                                        stopID: stop.id,
                                        event: event,
                                        place: stop.facility ?? stop.location,
                                        asksOdometer: (event == .arrived && stop.position == load.stops.first?.position)
                                            || (event == .departed && stop.position == load.stops.last?.position)
                                    )
                                })
                                .controlSize(.large)
                            } else {
                                Text("—")
                            }
                        }
                    }
                    if let reading = stop.departedOdometer ?? stop.arrivedOdometer {
                        LabeledContent("Odometer", value: "\(reading.formatted()) mi")
                    }
                    if waiting {
                        Label("Saved on this phone. Sends when you have signal.", systemImage: "icloud.and.arrow.up")
                            .foregroundStyle(.orange)
                    }
                } header: {
                    if isNext {
                        Label("Next · Stop \(stop.position) · \(stop.isPickup ? "Pickup" : "Delivery")", systemImage: "location.fill")
                            .foregroundStyle(.tint)
                    } else {
                        Text("Stop \(stop.position) · \(stop.isPickup ? "Pickup" : "Delivery")")
                    }
                }
            }

            Section("Load \(load.reference)") {
                LabeledContent("Status", value: load.status.label)
                if let truck = load.truck { LabeledContent("Truck", value: truck) }
                if let trailer = load.trailerNumber { LabeledContent("Trailer", value: trailer) }
                if let commodity = load.commodity { LabeledContent("Commodity", value: commodity) }
                if let weight = load.weightLbs { LabeledContent("Weight", value: "\(weight.formatted()) lbs") }
                if let miles = load.miles { LabeledContent("Miles", value: miles.formatted()) }
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
        .refreshable { await fetch() }
    }

    @ViewBuilder
    private func prominent(_ button: some View) -> some View {
        if #available(iOS 26.0, *) {
            button.buttonStyle(.glassProminent)
        } else {
            button.buttonStyle(.borderedProminent)
        }
    }

    /// The first stop the driver hasn't left yet, counting taps still queued.
    private func nextStop(_ load: LoadDetail, pending: [PendingCheckIn]) -> LoadDetail.Stop? {
        load.stops.first { stop in
            stop.departedAt == nil && !pending.contains { $0.stopID == stop.id && $0.event == .departed }
        }
    }

    private func appointment(_ stop: LoadDetail.Stop) -> String {
        switch stop.appointmentType {
        case "tbd": "To be scheduled"
        case "window": "\(WallClock.format(stop.appointmentStart)) – \(stop.appointmentEnd.map(WallClock.format) ?? "")"
        default: WallClock.format(stop.appointmentStart)
        }
    }

    private func record(_ request: CheckInRequest) {
        queue.enqueue(PendingCheckIn(
            loadID: request.loadID,
            stopID: request.stopID,
            event: request.event,
            tappedAt: .now,
            odometer: Int(odometer.filter(\.isNumber))
        ))
    }

    private func fetch() async {
        do {
            load = .loaded(try await api.myLoad(loadID))
        } catch {
            if case .loaded = load { return } // keep showing what we have
            load = .failed(error.driverMessage)
        }
    }
}

/// The check-in the driver is confirming.
struct CheckInRequest {
    let loadID: UUID
    let stopID: UUID
    let event: StopEvent
    let place: String
    let asksOdometer: Bool
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
