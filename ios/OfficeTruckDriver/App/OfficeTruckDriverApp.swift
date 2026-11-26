import SwiftUI
import UserNotifications

@main
struct OfficeTruckDriverApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
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
                // same truck, same place) while the session comes back.
                ZStack {
                    Color("LaunchBackground")
                    Image("LaunchLogo")
                        .accessibilityLabel("OfficeTruck")
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

/// Push notifications: dispatch sends one when it gives the driver a load.
/// Asked for once the driver is signed in (Trips), the phone's token is kept
/// on the server (`register_my_push_token`), and tapping a push opens its load.
@MainActor
@Observable
final class PushCenter {
    static let shared = PushCenter()

    /// This phone's push token, once iOS hands it over.
    private(set) var token: String?
    /// The load a tapped push is about, for Trips to open.
    var openLoad: UUID?

    /// Asks to send notifications (iOS asks only the first time), then gets a
    /// token. Demo mode has no server to send to.
    func requestAndRegister() async {
        #if DEBUG
        if DemoBackend.isOn { return }
        #endif
        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
    }

    fileprivate func received(_ deviceToken: Data) {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
    }
}

/// Hands iOS's push token to `PushCenter`, shows a push that arrives while
/// the app is open, and opens the load when one is tapped.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushCenter.shared.received(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // No token (the simulator, or no signal): the driver just isn't
        // notified; Trips still shows the load when they open the app.
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let id = (response.notification.request.content.userInfo["load_id"] as? String)
            .flatMap(UUID.init(uuidString:)) else { return }
        await MainActor.run { PushCenter.shared.openLoad = id }
    }
}
