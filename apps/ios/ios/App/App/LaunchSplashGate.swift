import UIKit

/// No clock or UIKit effects: a true result means the single transition to open.
struct LaunchSplashGate {
    enum Event {
        case mainFrameRequested(URL?)
        case started(AnyObject)
        case committed(AnyObject, URL?)
        case finished(AnyObject, mainFrame: Bool)
        case failed(AnyObject)
        case watchdog, lockShown
    }
    private(set) var isOpen = false
    private var current: AnyObject?
    private var destination: URL?
    private var awaitingDestination = false
    private var failed = false

    mutating func send(_ event: Event) -> Bool {
        guard !isOpen else { return false }
        switch event {
        case let .mainFrameRequested(url):
            // WKNavigationAction has no WKNavigation. Bind its destination at start/commit.
            destination = url
            awaitingDestination = true
        case let .started(navigation):
            current = navigation
            awaitingDestination = false
            failed = false
        case let .committed(navigation, url):
            // Redirects retain their navigation identity, even with another policy action.
            if current === navigation, url == destination { awaitingDestination = false }
        case let .finished(navigation, mainFrame):
            guard mainFrame, current === navigation, !awaitingDestination, !failed else { return false }
            isOpen = true
        case let .failed(navigation):
            if current === navigation { failed = true }
        case .watchdog, .lockShown: isOpen = true
        }
        return isOpen
    }
}

/// Owns the cover, one launch deadline, and the only removal path.
@MainActor
final class LaunchCoverAdapter {
    private(set) var gate = LaunchSplashGate()
    private(set) var cover: UIView?
    private(set) var removalCount = 0
    private(set) var removedOnMainThread = false
    private var installed = false
    private var started = false
    private let schedule: (TimeInterval, @escaping @MainActor @Sendable () -> Void) -> Void

    init(schedule: @escaping (TimeInterval, @escaping @MainActor @Sendable () -> Void) -> Void = { delay, work in
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }) {
        self.schedule = schedule
    }

    func startWatchdog() {
        guard !started else { return }
        started = true
        schedule(12) { [weak self] in self?.send(.watchdog) }
    }

    func install(in host: UIView) {
        guard !installed, !gate.isOpen else { return }
        installed = true
        guard let screen = UIStoryboard(name: "LaunchScreen", bundle: .main).instantiateInitialViewController()?.view else {
            send(.watchdog)
            return
        }
        screen.accessibilityIdentifier = "domus.launchCover"
        screen.isUserInteractionEnabled = true
        screen.frame = host.bounds
        screen.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(screen)
        cover = screen
    }

    func send(_ event: LaunchSplashGate.Event) {
        guard gate.send(event), let cover else { return }
        // Immediate removal also lets the lock become interactive in this same turn.
        cover.removeFromSuperview()
        self.cover = nil
        removalCount += 1
        removedOnMainThread = Thread.isMainThread
    }
}
