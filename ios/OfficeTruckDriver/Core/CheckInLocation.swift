import CoreLocation

/// Where the phone is when the driver checks in or out, saved with the stop
/// for detention. Runs only while a load that can be checked in is on screen
/// (`start()` / `stop()`), with When In Use permission; never in the
/// background.
@MainActor
final class CheckInLocation: NSObject, CLLocationManagerDelegate {
    static let shared = CheckInLocation()

    private let manager = CLLocationManager()
    private var active = false
    private var latest: CLLocation?
    private var waiting: [CheckedContinuation<CLLocation?, Never>] = []

    override private init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    /// The driver let the app use their location.
    var allowed: Bool {
        [.authorizedWhenInUse, .authorizedAlways].contains(manager.authorizationStatus)
    }

    /// Asks for permission the first time, then keeps a fresh fix ready.
    func start() {
        active = true
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if allowed {
            manager.startUpdatingLocation()
        }
    }

    func stop() {
        active = false
        manager.stopUpdatingLocation()
    }

    /// A fix from the last two minutes, waiting up to `timeout` for one.
    /// Nil without permission or a fix: the check-in goes without it.
    func fix(waiting timeout: Duration = .seconds(3)) async -> CLLocation? {
        if let latest, latest.timestamp > .now.addingTimeInterval(-120) { return latest }
        guard allowed else { return nil }
        manager.startUpdatingLocation()
        return await withCheckedContinuation { continuation in
            waiting.append(continuation)
            Task {
                try? await Task.sleep(for: timeout)
                self.resolve(nil)
            }
        }
    }

    private func resolve(_ location: CLLocation?) {
        let continuations = waiting
        waiting = []
        continuations.forEach { $0.resume(returning: location) }
        if !active { manager.stopUpdatingLocation() }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last(where: { $0.horizontalAccuracy >= 0 }) else { return }
        MainActor.assumeIsolated {
            latest = location
            resolve(location)
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_: CLLocationManager) {
        MainActor.assumeIsolated {
            if active && allowed { self.manager.startUpdatingLocation() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // No fix right now (indoors, airplane mode): check-ins go without one.
    }
}
