import SwiftUI

@main
struct OfficeTruckDriverApp: App {
    @State private var session = SessionModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { session.start() }
        }
    }
}

struct RootView: View {
    @Environment(SessionModel.self) private var session
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                // Picks up where the launch screen leaves off (same color,
                // same truck, same place), with a spinner while the session
                // comes back.
                ZStack {
                    Color("LaunchBackground")
                    Image("LaunchLogo")
                        .accessibilityLabel("OfficeTruck")
                }
                .overlay(alignment: .bottom) {
                    ProgressView()
                        .tint(.white)
                        .controlSize(.large)
                        .padding(.bottom, 96)
                }
                .ignoresSafeArea()
            case .signedOut:
                SignInView()
            case .signedIn:
                TripsView()
            case .notLinked(let phone):
                NavigationStack {
                    ContentUnavailableView {
                        Label("Not set up yet", systemImage: "person.crop.circle.badge.questionmark")
                    } description: {
                        Text("No carrier has \(phone.formattedPhone) on a driver record. Ask dispatch to add it, then try again.")
                    } actions: {
                        Button("Try again") { Task { await session.retryLink() } }
                            .buttonStyle(.borderedProminent)
                        Button("Sign out", role: .destructive) { Task { await session.signOut() } }
                    }
                }
            }
        }
        // Check-ins tapped without signal go out when the app is back in front.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await OfflineQueue.shared.flush() } }
        }
    }
}
