import SwiftUI

/// Pay statements, newest first. Totals appear once the office pays one.
struct PayView: View {
    @State private var settlements: Loadable<[SettlementSummary]> = .loading
    private let api = DriverAPI()

    var body: some View {
        NavigationStack {
            LoadableView(value: settlements, retry: load) { rows in
                if rows.isEmpty {
                    ContentUnavailableView("No pay statements yet", systemImage: "dollarsign.circle")
                } else {
                    List(rows) { row in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(WallClock.day(row.periodStart)) – \(WallClock.day(row.periodEnd))")
                                    .font(.headline)
                                Text(row.isPaid
                                     ? "Paid \(row.paidOn.map(WallClock.day) ?? "")"
                                     : "Open")
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if let net = row.netPay {
                                Text(net.dollars).font(.title3.bold().monospacedDigit())
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Pay")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            settlements = .loaded(try await api.mySettlements())
        } catch {
            settlements = .failed(error.driverMessage)
        }
    }
}
