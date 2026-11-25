import PhotosUI
import SwiftUI

/// One load: its stops, details and paperwork. On a load that's on the road,
/// Check in / Check out for the next stop is pinned to the bottom, and
/// paperwork is added from the toolbar.
struct LoadScreen: View {
    let loadID: UUID

    @State private var load: Loadable<LoadDetail> = .loading
    @State private var checkIn: CheckInRequest?
    @State private var odometer = ""
    /// Paperwork being added: the kind picked, then how.
    @State private var addKind: DocumentKind?
    /// Checking out without the stop's BOL or POD: warn first.
    @State private var missingPaperwork: MissingPaperwork?
    @State private var scanKind: DocumentKind?
    @State private var photoKind: DocumentKind?
    @State private var choosingPhotos = false
    @State private var photoItems: [PhotosPickerItem] = []
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
            // The preferred action is drawn in the app's green.
            Button(request.event == .arrived ? "Arrived" : "Departed") { record(request) }
                .keyboardShortcut(.defaultAction)
        } message: { _ in
            Text("This records \(Date.now.formatted(date: .omitted, time: .shortened)). Only dispatch can change it after.")
        }
        .alert(
            missingPaperwork.map { "No \($0.kind.label) yet" } ?? "",
            isPresented: Binding(get: { missingPaperwork != nil }, set: { if !$0 { missingPaperwork = nil } }),
            presenting: missingPaperwork
        ) { missing in
            // Each choice waits for this alert to close before opening the next.
            Button("Add \(missing.kind.label)") {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(350))
                    addKind = missing.kind
                }
            }
            .keyboardShortcut(.defaultAction)
            Button("Check out anyway") {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(350))
                    startCheckIn(.departed, stop: missing.stop, load: missing.load)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: { missing in
            Text("You haven't added the \(missing.kind.label) for \(missing.stop.facility ?? missing.stop.location). Add it before you leave so dispatch can bill the load.")
        }
        .alert(
            "Not saved",
            isPresented: Binding(get: { !queue.rejections.isEmpty }, set: { if !$0 { queue.rejections.removeAll() } })
        ) {
            Button("OK") {}
        } message: {
            Text((queue.rejections.first ?? "") + " Call dispatch to sort it out.")
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
                    LabeledContent("Arrived", value: arrived?.formatted(date: .omitted, time: .shortened) ?? "—")
                    LabeledContent("Departed", value: departed?.formatted(date: .omitted, time: .shortened) ?? "—")
                    if let reading = stop.departedOdometer ?? stop.arrivedOdometer {
                        LabeledContent("Odometer", value: "\(reading.formatted()) mi")
                    }
                    if waiting {
                        Label("Saved on this phone. Sends when you have signal.", systemImage: "icloud.and.arrow.up")
                            .foregroundStyle(.orange)
                    }
                } header: {
                    // The next stop's header is in the tint color.
                    if isNext {
                        Text("Stop \(stop.position) · \(stop.isPickup ? "Pickup" : "Delivery")")
                            .foregroundStyle(.tint)
                    } else {
                        Text("Stop \(stop.position) · \(stop.isPickup ? "Pickup" : "Delivery")")
                    }
                }
            }

            Section("Details") {
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
                let waitingDocuments = queue.documents(for: load.id)
                if load.documents.isEmpty && waitingDocuments.isEmpty {
                    Text("No paperwork yet").foregroundStyle(.secondary)
                }
                ForEach(load.documents) { doc in
                    LabeledContent(doc.kind.documentLabel, value: doc.createdAt.formatted(date: .abbreviated, time: .shortened))
                }
                ForEach(waitingDocuments) { doc in
                    LabeledContent(doc.kind.label) {
                        Text("Not sent yet").foregroundStyle(.orange)
                    }
                }
            }
        }
        .refreshable { await fetch() }
        .navigationTitle("Load \(load.reference)")
        .navigationBarTitleDisplayMode(.inline)
        // Toolbar: call dispatch, and add paperwork with what the next stop
        // usually needs first (BOL at a pickup, POD at a delivery).
        .toolbar {
            if let phone = load.organization.phone, let url = URL(string: "tel:\(phone.filter(\.isNumber))") {
                ToolbarItem(placement: .topBarTrailing) {
                    // iOS's own call prompt only shows the number, so the
                    // menu says who it is first.
                    Menu {
                        Section("\(load.organization.name) · \(phone)") {
                            Link(destination: url) {
                                Label("Call Dispatch", systemImage: "phone")
                            }
                        }
                    } label: {
                        Label("Call dispatch", systemImage: "phone")
                    }
                }
            }
            if load.canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        let first: DocumentKind = (next ?? load.stops.last)?.isPickup == true ? .bol : .pod
                        ForEach([first] + DocumentKind.allCases.filter { $0 != first }) { kind in
                            Button(kind.label) { addKind = kind }
                        }
                    } label: {
                        Label("Add paperwork", systemImage: "doc.badge.plus")
                    }
                }
            }
        }
        // Check in / Check out is the screen's primary action, pinned to the
        // bottom so it's always one tap away.
        .safeAreaInset(edge: .bottom) {
            if load.canEdit, let next {
                let arrived = next.arrivedAt != nil || pending.contains { $0.stopID == next.id && $0.event == .arrived }
                let start = {
                    let needed: DocumentKind = next.isPickup ? .bol : .pod
                    let hasIt = load.documents.contains { $0.kind == needed.rawValue }
                        || queue.documents(for: load.id).contains { $0.kind == needed }
                    if arrived && !hasIt {
                        missingPaperwork = MissingPaperwork(kind: needed, stop: next, load: load)
                    } else {
                        startCheckIn(arrived ? .departed : .arrived, stop: next, load: load)
                    }
                }
                let title = arrived ? "Check out" : "Check in"
                Group {
                    if #available(iOS 26.0, *) {
                        Button(action: start) {
                            Text(title).font(.headline).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glassProminent)
                    } else {
                        Button(action: start) {
                            Text(title).font(.headline).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .controlSize(.extraLarge)
                .padding(.horizontal)
                .padding(.bottom, 8)
            }
        }
        .alert(
            addKind.map { "Add \($0.label)" } ?? "",
            isPresented: Binding(get: { addKind != nil }, set: { if !$0 { addKind = nil } }),
            presenting: addKind
        ) { kind in
            if DocumentScanner.isAvailable {
                Button("Scan") { scanKind = kind }
                    .keyboardShortcut(.defaultAction)
            }
            Button("Choose from Photos") {
                photoKind = kind
                choosingPhotos = true
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Scan the paper, or pick photos you already took.")
        }
        .fullScreenCover(item: $scanKind) { kind in
            DocumentScanner(
                onScan: { pages in
                    scanKind = nil
                    addPaperwork(pages, kind: kind, to: load)
                },
                onCancel: { scanKind = nil }
            )
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $choosingPhotos, selection: $photoItems, maxSelectionCount: 10, matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty, let kind = photoKind else { return }
            photoItems = []
            photoKind = nil
            Task {
                var pages: [UIImage] = []
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        pages.append(image)
                    }
                }
                addPaperwork(pages, kind: kind, to: load)
            }
        }
    }

    /// Opens the confirmation alert for a check-in.
    private func startCheckIn(_ event: StopEvent, stop: LoadDetail.Stop, load: LoadDetail) {
        odometer = ""
        checkIn = CheckInRequest(
            loadID: load.id,
            stopID: stop.id,
            event: event,
            place: stop.facility ?? stop.location,
            asksOdometer: (event == .arrived && stop.position == load.stops.first?.position)
                || (event == .departed && stop.position == load.stops.last?.position)
        )
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

    /// Makes one PDF of the pages and queues it for upload.
    private func addPaperwork(_ pages: [UIImage], kind: DocumentKind, to load: LoadDetail) {
        guard let pdf = DocumentPDF.make(from: pages) else { return }
        queue.enqueueDocument(loadID: load.id, organizationID: load.organization.id, kind: kind, pdf: pdf)
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

/// Checking out of a stop without its BOL (pickup) or POD (delivery).
struct MissingPaperwork {
    let kind: DocumentKind
    let stop: LoadDetail.Stop
    let load: LoadDetail
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
