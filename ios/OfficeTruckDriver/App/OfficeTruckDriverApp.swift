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

    var body: some View {
        switch session.state {
        case .loading:
            ProgressView()
        case .signedOut:
            SignInView()
        case .signedIn:
            MainTabView()
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
