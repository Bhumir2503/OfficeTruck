import SwiftUI

/// Pay statements, newest first, opened from Trips. Totals appear once the
/// office pays one.
struct PayView: View {
    @State private var settlements: Loadable<[SettlementSummary]> = .loading
    private let api = DriverAPI()

    var body: some View {
        Group {
            switch settlements {
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
            case .loaded(let rows) where rows.isEmpty:
                ContentUnavailableView("No pay statements yet", systemImage: "dollarsign")
            case .loaded(let rows):
                // The carrier's name shows only for drivers paid by more than one.
                let showsCarrier = Set(rows.map(\.organizationName)).count > 1
                List(rows) { row in
                    LabeledContent {
                        if let net = row.netPay { Text(net.dollars).monospacedDigit() }
                    } label: {
                        Text("\(WallClock.day(row.periodStart)) – \(WallClock.day(row.periodEnd))")
                        let state = row.isPaid ? "Paid \(row.paidOn.map(WallClock.day) ?? "")" : "Open"
                        Text(showsCarrier ? "\(row.organizationName) · \(state)" : state)
                    }
                }
                .refreshable { await fetch() }
            }
        }
        .navigationTitle("Pay")
        .navigationBarTitleDisplayMode(.inline)
        .task { await fetch() }
    }

    private func fetch() async {
        do {
            settlements = .loaded(try await api.mySettlements())
        } catch {
            settlements = .failed(error.driverMessage)
        }
    }
}
