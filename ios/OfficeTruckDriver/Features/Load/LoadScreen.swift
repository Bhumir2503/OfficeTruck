import PhotosUI
import QuickLook
import Supabase
import SwiftUI

/// One load: its stops, a paperwork checklist and the driver's expenses,
/// with the load's details and dispatch's notes behind the (i) button. On a load that's on the road, Check in / Check out for the
/// next stop is pinned to the bottom; paperwork and expenses are added from
/// their own sections.
struct LoadScreen: View {
    let loadID: UUID
    /// Other loads of the driver's at the same time as this one, from Trips.
    var overlaps: [String] = []

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
    /// A paperwork file open in Quick Look.
    @State private var previewURL: URL?
    @State private var removing: LoadDetail.LoadDocument?
    @State private var removingExpense: LoadDetail.Expense?
    @State private var actionError: String?
    @State private var addingExpense = false
    @State private var showingInfo = false
    @State private var choosingOtherPaperwork = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
        // A fresh location is kept ready while a load that can be checked in
        // is on screen, and only then.
        .task(id: canCheckIn) {
            if canCheckIn { CheckInLocation.shared.start() } else { CheckInLocation.shared.stop() }
        }
        .onDisappear { CheckInLocation.shared.stop() }
        .quickLookPreview($previewURL)
        .alert(
            removing.map { "Remove the \($0.kind.documentLabel)?" } ?? "",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            presenting: removing
        ) { doc in
            Button("Remove", role: .destructive) { Task { await remove(doc) } }
            Button("Cancel", role: .cancel) {}
        } message: { doc in
            switch doc.kind {
            case "pod": Text("The load goes back to not delivered until a POD is added again.")
            case "bol": Text("If it was the only BOL, the load goes back to not loaded.")
            default: Text("The office won't see it anymore.")
            }
        }
        .alert(
            removingExpense.map { "Remove this \((ExpenseKind(rawValue: $0.kind) ?? .other).label.lowercased()) expense?" } ?? "",
            isPresented: Binding(get: { removingExpense != nil }, set: { if !$0 { removingExpense = nil } }),
            presenting: removingExpense
        ) { expense in
            Button("Remove", role: .destructive) { Task { await removeExpense(expense) } }
            Button("Cancel", role: .cancel) {}
        } message: { expense in
            Text("\(expense.amount.dollars) on \(WallClock.day(expense.spentOn)). The office won't pay it back.")
        }
        .alert("Couldn't do that", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
            Button("OK") {}
        } message: {
            Text(actionError ?? "")
        }
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
            Text("This records \(Date.now.formatted(date: .omitted, time: .shortened))\(CheckInLocation.shared.allowed ? " with your location" : ""). Only dispatch can change it after.")
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
            // Dispatch was warned when it booked them; the driver needs to
            // hear it too, before driving to the wrong one first.
            if !overlaps.isEmpty && (load.status == .dispatched || load.status == .loaded) {
                Section {
                    Label {
                        Text("This load's times overlap \(overlaps.formatted(.list(type: .and))). Call dispatch to check which comes first.")
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    }
                    if let phone = load.organization.phone, let url = telURL(phone) {
                        Link(destination: url) {
                            Label("Call dispatch", systemImage: "phone")
                        }
                    }
                }
            }
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

            paperwork(load, next: next, pending: pending)
            expenses(load)
        }
        .refreshable { await fetch() }
        .navigationTitle("Load \(load.reference)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Load info: the details and dispatch's notes, kept off the main
            // screen so what the driver does comes first.
            ToolbarItem(placement: .topBarTrailing) {
                Button("Load info", systemImage: "info.circle") { showingInfo = true }
            }
            // More: calls, directions and the stop's number, the things a
            // driver reaches for at a stop.
            ToolbarItem(placement: .topBarTrailing) {
                let stop = next ?? load.stops.last
                Menu {
                    Section("Call") {
                        if let phone = load.organization.phone, let url = telURL(phone) {
                            Link(destination: url) {
                                Label("Dispatch", systemImage: "phone")
                            }
                        }
                        if let stop, let phone = stop.contactPhone, let url = telURL(phone) {
                            Link(destination: url) {
                                Label(stop.facility ?? stop.location, systemImage: "phone")
                            }
                        }
                    }
                    if let stop {
                        Section("Stop \(stop.position) · \(stop.isPickup ? "Pickup" : "Delivery")") {
                            if let url = directionsURL(stop) {
                                Link(destination: url) {
                                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond")
                                }
                            }
                            if let number = stop.stopNumber {
                                Button("Copy \(number)", systemImage: "doc.on.doc") {
                                    UIPasteboard.general.string = number
                                }
                            }
                        }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis")
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
        .sheet(isPresented: $showingInfo) {
            NavigationStack {
                List {
                    if let notes = load.notes, !notes.isEmpty {
                        Section("Notes from dispatch") { Text(notes) }
                    }
                    Section("Details") {
                        LabeledContent("Status", value: load.status.label)
                        if let truck = load.truck { LabeledContent("Truck", value: truck) }
                        if let trailer = load.trailerNumber { LabeledContent("Trailer", value: trailer) }
                        if let commodity = load.commodity { LabeledContent("Commodity", value: commodity) }
                        if let weight = load.weightLbs { LabeledContent("Weight", value: "\(weight.formatted()) lbs") }
                        if let miles = load.miles { LabeledContent("Miles", value: miles.formatted()) }
                    }
                }
                .navigationTitle("Load \(load.reference)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showingInfo = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $addingExpense) {
            AddExpenseView(load: load)
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

    /// The load's paperwork: one row each for the BOL and POD the load
    /// needs, then anything else (lumper receipts and the like). A missing
    /// BOL or POD is tapped to add it; one that's in says View, opens
    /// on a tap, and swipes left to View, Upload again or Remove.
    @ViewBuilder
    private func paperwork(_ load: LoadDetail, next: LoadDetail.Stop?, pending: [PendingCheckIn]) -> some View {
        let waitingDocuments = queue.documents(for: load.id)

        Section {
            ForEach([DocumentKind.bol, .pod]) { kind in
                let added = load.documents.filter { $0.kind == kind.rawValue }
                let waiting = waitingDocuments.filter { $0.kind == kind }
                let hasIt = !added.isEmpty || !waiting.isEmpty
                // Needed now: at the stop that hands it over, once checked in.
                let neededNow = !hasIt && next.map {
                    $0.isPickup == (kind == .bol) && arrivedTime($0, pending: pending) != nil
                } == true
                // The newest copy: what View opens and Remove takes away.
                let view = {
                    if let doc = waiting.last {
                        previewURL = OfflineQueue.fileURL(for: doc)
                    } else if let doc = added.last {
                        Task { await preview(bucket: "load-documents", path: doc.path, name: doc.fileName) }
                    }
                }

                Button {
                    if hasIt { view() } else if load.canEdit { addKind = kind }
                } label: {
                    LabeledContent {
                        if !waiting.isEmpty {
                            Text("Sending").foregroundStyle(.orange)
                        } else if hasIt {
                            Text("View").foregroundStyle(Color.accentColor)
                        } else if load.canEdit {
                            Text("Add").foregroundStyle(Color.accentColor)
                        }
                    } label: {
                        Text(kind.label).foregroundStyle(.primary)
                        Text(added.last.map { "Added \($0.createdAt.formatted(.dateTime.month().day().hour().minute()))" }
                             ?? (kind == .bol ? "Signed at pickup" : "Signed at delivery"))
                            .foregroundStyle(neededNow ? AnyShapeStyle(.orange) : AnyShapeStyle(.secondary))
                    }
                }
                // The name and hint read as text, not as a link; only "Add"
                // is in the app's color.
                .tint(.primary)
                .disabled(!hasIt && !load.canEdit)
                // No full swipe, so a long swipe can't remove it by accident.
                .swipeActions(allowsFullSwipe: false) {
                    if hasIt {
                        if load.canEdit {
                            if let doc = waiting.last {
                                Button("Stop sending", systemImage: "xmark", role: .destructive) {
                                    if !queue.cancelDocument(doc.id) {
                                        actionError = "It's sending right now. Remove it once it's sent."
                                    }
                                }
                            } else if let doc = added.last, doc.mine {
                                Button("Remove", systemImage: "trash", role: .destructive) { removing = doc }
                            }
                            Button("Upload again", systemImage: "arrow.clockwise") { addKind = kind }
                                .tint(.orange)
                        }
                        Button("View", systemImage: "eye", action: view)
                            .tint(.blue)
                    }
                }
            }

            // Everything else: lumper receipts, other papers, the rate
            // confirmation when the driver may see it.
            ForEach(load.documents.filter { $0.kind != "bol" && $0.kind != "pod" }) { doc in
                let view = {
                    Task { await preview(bucket: "load-documents", path: doc.path, name: doc.fileName) }
                }
                Button { _ = view() } label: {
                    LabeledContent {
                        Text("View").foregroundStyle(Color.accentColor)
                    } label: {
                        Text(doc.kind.documentLabel)
                        Text("Added \(doc.createdAt.formatted(.dateTime.month().day().hour().minute()))")
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(.primary)
                .swipeActions(allowsFullSwipe: false) {
                    if load.canEdit {
                        if doc.mine {
                            Button("Remove", systemImage: "trash", role: .destructive) { removing = doc }
                        }
                        if let kind = DocumentKind(rawValue: doc.kind) {
                            Button("Upload again", systemImage: "arrow.clockwise") { addKind = kind }
                                .tint(.orange)
                        }
                    }
                    Button("View", systemImage: "eye") { _ = view() }
                        .tint(.blue)
                }
            }
            ForEach(waitingDocuments.filter { $0.kind != .bol && $0.kind != .pod }) { doc in
                Button {
                    previewURL = OfflineQueue.fileURL(for: doc)
                } label: {
                    LabeledContent {
                        Text("Sending").foregroundStyle(.orange)
                    } label: {
                        Text(doc.kind.label).foregroundStyle(.primary)
                    }
                }
                .swipeActions(allowsFullSwipe: false) {
                    Button("Stop sending", systemImage: "xmark", role: .destructive) {
                        if !queue.cancelDocument(doc.id) {
                            actionError = "It's sending right now. Remove it once it's sent."
                        }
                    }
                    Button("View", systemImage: "eye") { previewURL = OfflineQueue.fileURL(for: doc) }
                        .tint(.blue)
                }
            }

            if load.canEdit {
                Button {
                    choosingOtherPaperwork = true
                } label: {
                    Text("Add lumper receipt or other")
                }
                .confirmationDialog("Add paperwork", isPresented: $choosingOtherPaperwork) {
                    Button(DocumentKind.lumperReceipt.label) { addKind = .lumperReceipt }
                    Button("Other paperwork") { addKind = .other }
                }
            }
        } header: {
            Text("Paperwork")
        } footer: {
            Text("Swipe left on paperwork to view it, upload it again or remove it.")
        }
    }

    /// What the driver paid out of pocket on this load, owed back to them,
    /// and Add expense. Tap one with a receipt to open it; swipe to cancel
    /// one not sent yet.
    @ViewBuilder
    private func expenses(_ load: LoadDetail) -> some View {
        let waiting = queue.expenses(for: load.id)
        let total = load.expenses.reduce(0) { $0 + $1.amount } + waiting.reduce(0) { $0 + $1.amount }

        Section {
            if load.expenses.isEmpty && waiting.isEmpty && !load.canEdit {
                Text("No expenses").foregroundStyle(.secondary)
            }
            ForEach(load.expenses) { expense in
                let kind = ExpenseKind(rawValue: expense.kind) ?? .other
                Button {
                    if let path = expense.receiptPath {
                        Task { await preview(bucket: "load-documents", path: path, name: "\(kind.label) receipt") }
                    }
                } label: {
                    LabeledContent {
                        Text(expense.amount.dollars)
                            .font(.body.monospacedDigit())
                            .foregroundStyle(.primary)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(kind.label).foregroundStyle(.primary)
                                Text(([WallClock.day(expense.spentOn)] + [expense.note].compactMap { $0 }
                                      + (expense.receiptPath != nil ? ["Receipt"] : [])).joined(separator: " · "))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: kind.systemImage)
                        }
                    }
                }
                .disabled(expense.receiptPath == nil)
                // No full swipe, so a long swipe can't remove it by accident.
                .swipeActions(allowsFullSwipe: false) {
                    if load.canEdit && expense.mine == true {
                        Button("Remove", systemImage: "trash", role: .destructive) { removingExpense = expense }
                    }
                    if let path = expense.receiptPath {
                        Button("View", systemImage: "eye") {
                            Task { await preview(bucket: "load-documents", path: path, name: "\(kind.label) receipt") }
                        }
                        .tint(.blue)
                    }
                }
            }
            ForEach(waiting) { expense in
                Button {
                    if expense.hasReceipt { previewURL = OfflineQueue.receiptURL(for: expense) }
                } label: {
                    LabeledContent {
                        Text(expense.amount.dollars)
                            .font(.body.monospacedDigit())
                            .foregroundStyle(.primary)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(expense.kind.label).foregroundStyle(.primary)
                                Text("Not sent yet").font(.subheadline).foregroundStyle(.orange)
                            }
                        } icon: {
                            Image(systemName: expense.kind.systemImage)
                        }
                    }
                }
                .swipeActions(allowsFullSwipe: false) {
                    Button("Stop sending", systemImage: "xmark", role: .destructive) {
                        if !queue.cancelExpense(expense.id) {
                            actionError = "It's sending right now. Remove it once it's sent."
                        }
                    }
                    if expense.hasReceipt {
                        Button("View", systemImage: "eye") { previewURL = OfflineQueue.receiptURL(for: expense) }
                            .tint(.blue)
                    }
                }
            }
            if load.expenses.count + waiting.count > 1 {
                LabeledContent("Total") {
                    Text(total.dollars).font(.headline.monospacedDigit()).foregroundStyle(.primary)
                }
                .font(.headline)
            }
            if load.canEdit {
                Button {
                    addingExpense = true
                } label: {
                    Text("Add expense")
                }
            }
        } header: {
            Text("Expenses")
        } footer: {
            Text("Fuel, tolls, scales and anything else you paid for yourself. The office pays it back on your settlement. Swipe left on one to view the receipt or remove it.")
        }
    }

    private func preview(bucket: String, path: String, name: String) async {
        do {
            previewURL = try await api.downloadForPreview(bucket: bucket, path: path, name: name)
        } catch {
            actionError = "It couldn't be opened. Check your signal and try again."
        }
    }

    private func removeExpense(_ expense: LoadDetail.Expense) async {
        do {
            try await api.removeExpense(expense.id)
            await fetch()
        } catch let error as PostgrestError {
            actionError = error.message
        } catch {
            actionError = "It wasn't removed. Check your signal and try again."
        }
    }

    private func remove(_ doc: LoadDetail.LoadDocument) async {
        do {
            try await api.removeLoadDocument(doc.id)
            await fetch()
        } catch let error as PostgrestError {
            actionError = error.message
        } catch {
            actionError = "It wasn't removed. Check your signal and try again."
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

    private func telURL(_ phone: String) -> URL? {
        URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })")
    }

    /// Apple Maps directions to a stop.
    private func directionsURL(_ stop: LoadDetail.Stop) -> URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(
            name: "daddr",
            value: [stop.facility, stop.location].compactMap { $0 }.joined(separator: ", ")
        )]
        return components?.url
    }

    /// When the driver checked in at a stop, counting a tap still queued.
    private func arrivedTime(_ stop: LoadDetail.Stop, pending: [PendingCheckIn]) -> Date? {
        stop.arrivedAt ?? pending.first { $0.stopID == stop.id && $0.event == .arrived }?.tappedAt
    }

    /// When the driver checked out of a stop, counting a tap still queued.
    private func departedTime(_ stop: LoadDetail.Stop, pending: [PendingCheckIn]) -> Date? {
        stop.departedAt ?? pending.first { $0.stopID == stop.id && $0.event == .departed }?.tappedAt
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
        case "window": stop.appointmentEnd.map { WallClock.window(stop.appointmentStart, $0) } ?? WallClock.format(stop.appointmentStart)
        default: WallClock.format(stop.appointmentStart)
        }
    }

    /// Makes one PDF of the pages and queues it for upload.
    private func addPaperwork(_ pages: [UIImage], kind: DocumentKind, to load: LoadDetail) {
        guard let pdf = DocumentPDF.make(from: pages) else { return }
        queue.enqueueDocument(loadID: load.id, organizationID: load.organization.id, kind: kind, pdf: pdf)
    }

    private var canCheckIn: Bool {
        if case .loaded(let detail) = load { detail.canEdit } else { false }
    }

    /// Queues the check-in with where the phone is. The time is the tap;
    /// the location waits up to a few seconds for a fix, and goes without
    /// one rather than hold the check-in up.
    private func record(_ request: CheckInRequest) {
        let tapped = Date.now
        let reading = Int(odometer.filter(\.isNumber))
        Task {
            let fix = await CheckInLocation.shared.fix()
            queue.enqueue(PendingCheckIn(
                loadID: request.loadID,
                stopID: request.stopID,
                event: request.event,
                tappedAt: tapped,
                odometer: reading,
                latitude: fix?.coordinate.latitude,
                longitude: fix?.coordinate.longitude,
                locationAccuracy: fix?.horizontalAccuracy
            ))
        }
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
    /// Other loads of the driver's at the same time as this one, from Trips.
    var overlaps: [String] = []
    let stopID: UUID
    let event: StopEvent
    let place: String
    let asksOdometer: Bool
}

/// An expense the driver paid out of pocket: what for, how much, the day,
/// and a receipt if they have one. Queued like a scan, so it goes even
/// with no signal.
struct AddExpenseView: View {
    let load: LoadDetail

    @Environment(\.dismiss) private var dismiss
    @State private var kind: ExpenseKind = .fuel
    @State private var amountText = ""
    @State private var spentOn = Date.now
    @State private var note = ""
    @State private var pages: [UIImage] = []
    @State private var scanning = false
    @State private var choosingPhotos = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var error: String?
    @FocusState private var amountFocused: Bool
    private let queue = OfflineQueue.shared

    /// The amount typed, in dollars and cents; nil until it's a real amount.
    private var amount: Double? {
        guard let value = try? Decimal(amountText.replacingOccurrences(of: "$", with: ""), format: .number),
              value > 0, value <= 99_999_999.99 else { return nil }
        return (NSDecimalNumber(decimal: value).doubleValue * 100).rounded() / 100
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Type", selection: $kind) {
                        ForEach(ExpenseKind.allCases) { kind in
                            Label(kind.label, systemImage: kind.systemImage).tag(kind)
                        }
                    }
                    LabeledContent("Amount") {
                        TextField("$0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .font(.title3.monospacedDigit())
                            .focused($amountFocused)
                    }
                    DatePicker("Paid on", selection: $spentOn, in: ...Date.now, displayedComponents: .date)
                    TextField("Note (optional)", text: $note, axis: .vertical)
                        .onChange(of: note) { _, text in
                            if text.count > 200 { note = String(text.prefix(200)) }
                        }
                }

                Section {
                    if let first = pages.first {
                        Image(uiImage: first)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity, maxHeight: 220)
                            .clipShape(.rect(cornerRadius: 8))
                            .accessibilityLabel("Receipt")
                        if pages.count > 1 {
                            LabeledContent("Pages", value: "\(pages.count)")
                        }
                        Button("Remove receipt", role: .destructive) { pages = [] }
                    } else {
                        if DocumentScanner.isAvailable {
                            Button {
                                scanning = true
                            } label: {
                                Label("Scan receipt", systemImage: "doc.viewfinder")
                            }
                        }
                        Button {
                            choosingPhotos = true
                        } label: {
                            Label("Choose from Photos", systemImage: "photo.on.rectangle")
                        }
                    }
                } header: {
                    Text("Receipt")
                } footer: {
                    Text("The office pays it back on your settlement. A receipt helps them approve it.")
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Add expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: add)
                        .disabled(amount == nil)
                }
            }
            .onAppear { amountFocused = true }
            .fullScreenCover(isPresented: $scanning) {
                DocumentScanner(
                    onScan: { scanned in
                        pages = scanned
                        scanning = false
                    },
                    onCancel: { scanning = false }
                )
                .ignoresSafeArea()
            }
            .photosPicker(isPresented: $choosingPhotos, selection: $photoItems, maxSelectionCount: 5, matching: .images)
            .onChange(of: photoItems) { _, items in
                guard !items.isEmpty else { return }
                photoItems = []
                Task {
                    var picked: [UIImage] = []
                    for item in items {
                        if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                            picked.append(image)
                        }
                    }
                    pages = picked
                }
            }
        }
    }

    private func add() {
        guard let amount else { return }
        var receipt: Data?
        if !pages.isEmpty {
            guard let pdf = DocumentPDF.make(from: pages) else {
                error = "That receipt couldn't be read. Take it again."
                return
            }
            receipt = pdf
        }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        queue.enqueueExpense(
            loadID: load.id,
            organizationID: load.organization.id,
            kind: kind,
            amount: amount,
            spentOn: WallClock.string(from: spentOn),
            note: trimmed.isEmpty ? nil : trimmed,
            receipt: receipt
        )
        dismiss()
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
