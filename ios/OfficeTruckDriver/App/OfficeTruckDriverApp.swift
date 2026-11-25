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
                ProgressView()
            case .signedOut:
                SignInView()
            case .signedIn:
                MainTabView()
            }
        }
        // Check-ins tapped without signal go out when the app is back in front.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await OfflineQueue.shared.flush() } }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            CurrentLoadView()
                .tabItem { Label("Load", systemImage: "shippingbox") }
            TripsView()
                .tabItem { Label("Trips", systemImage: "list.bullet.rectangle") }
            PayView()
                .tabItem { Label("Pay", systemImage: "dollarsign.circle") }
            MeView()
                .tabItem { Label("Me", systemImage: "person.crop.circle") }
        }
    }
}
