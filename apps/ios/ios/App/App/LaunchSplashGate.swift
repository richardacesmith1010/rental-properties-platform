import UIKit
import os

/// Only controlled labels and geometry belong here; never URLs or authentication data.
enum LaunchDiagnostics {
    static let logger = Logger(subsystem: "com.domusbase.app", category: "launch")
    static func fact(_ name: String, _ value: String) {
        logger.notice("\(name, privacy: .public)=\(value, privacy: .public)")
    }
}

/// No clock or UIKit effects: a true result means the single transition to open.
struct LaunchSplashGate {
    enum RemovalReason: String { case finished, offlineFinished, watchdog, lockShown }
    enum Event {
        case mainFrameRequested(URL?)
        case started(AnyObject)
        case committed(AnyObject, URL?)
        case finished(AnyObject, mainFrame: Bool)
        case failed(AnyObject)
        case watchdog, lockShown

        var label: String {
            switch self {
            case .mainFrameRequested: return "mainFrameRequested"
            case .started: return "started"
            case .committed: return "committed"
            case .finished: return "finished"
            case .failed: return "failed"
            case .watchdog: return "watchdog"
            case .lockShown: return "lockShown"
            }
        }
    }
    private(set) var isOpen = false
    private(set) var removalReason: RemovalReason?
    var offlineURL: URL?
    private var currentIsOffline = false
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
            currentIsOffline = offlineURL != nil && destination == offlineURL
            awaitingDestination = false
            failed = false
        case let .committed(navigation, url):
            // Redirects retain their navigation identity, even with another policy action.
            if current === navigation, url == destination { awaitingDestination = false }
        case let .finished(navigation, mainFrame):
            guard mainFrame, current === navigation, !awaitingDestination, !failed else { return false }
            removalReason = currentIsOffline ? .offlineFinished : .finished
        case let .failed(navigation):
            if current === navigation { failed = true }
        case .watchdog: removalReason = .watchdog
        case .lockShown: removalReason = .lockShown
        }
        isOpen = removalReason != nil
        return isOpen
    }
}

/// A value snapshot lets the visibility rule be tested without creating another app scene.
struct LaunchLockVisibility {
    var enabled: Bool
    var phase: AppLock.Phase?
    var windowExists: Bool
    var appScene: ObjectIdentifier?
    var lockScene: ObjectIdentifier?
    var hidden: Bool
    var alpha: CGFloat

    var sameScene: Bool { appScene != nil && lockScene == appScene }
    var phaseName: String {
        switch phase {
        case .locked?: return "locked"
        case .authenticating?: return "authenticating"
        case .signingOut?: return "signingOut"
        case .covered?: return "covered"
        case .open?: return "open"
        case nil: return "missing"
        }
    }
    var rejection: String? {
        guard enabled else { return "feature disabled" }
        switch phase {
        case .locked?, .authenticating?: break
        default: return "phase is not locked/authenticating"
        }
        guard windowExists else { return "lock window missing" }
        guard sameScene else { return "lock scene differs or missing" }
        guard !hidden else { return "lock window hidden" }
        guard alpha > 0 else { return "lock window transparent" }
        return nil
    }
}

/// Never competes with the app or Face ID window for keyboard focus.
private final class LaunchCoverWindow: UIWindow {
    override var canBecomeKey: Bool { false }
}

/// Owns the cover, one launch deadline, and the only removal path.
@MainActor
final class LaunchCoverAdapter {
    private(set) var gate = LaunchSplashGate()
    private(set) var coverWindow: UIWindow?
    var cover: UIView? { coverWindow?.rootViewController?.viewIfLoaded }
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

    func configureOfflineURL(_ url: URL?) { gate.offlineURL = url }

    func startWatchdog() {
        guard !started else { return }
        started = true
        schedule(12) { [weak self] in self?.send(.watchdog, source: "deadline") }
    }

    func install(in appWindow: UIWindow?) {
        guard !installed, !gate.isOpen else { return }
        installed = true
        guard let appWindow else {
            LaunchDiagnostics.fact("cover.installSkipped", "appWindow missing; system background fallback")
            return
        }
        guard let scene = appWindow.windowScene else {
            LaunchDiagnostics.fact("cover.installSkipped", "scene missing; system background fallback")
            return
        }
        guard Bundle.main.path(forResource: "LaunchScreen", ofType: "storyboardc") != nil else {
            LaunchDiagnostics.fact("cover.storyboardLoaded", "false")
            LaunchDiagnostics.fact("cover.viewLoaded", "false")
            send(.watchdog, source: "storyboardMissing")
            return
        }
        let storyboard = UIStoryboard(name: "LaunchScreen", bundle: .main)
        LaunchDiagnostics.fact("cover.storyboardLoaded", "true")
        let controller = storyboard.instantiateInitialViewController()
        controller?.loadViewIfNeeded()
        LaunchDiagnostics.fact("cover.viewLoaded", String(controller?.viewIfLoaded != nil))
        guard let controller, let screen = controller.viewIfLoaded else {
            send(.watchdog, source: "storyboardViewMissing")
            return
        }
        let window = LaunchCoverWindow(windowScene: scene)
        window.windowLevel = .normal + 1
        window.backgroundColor = .systemBackground
        window.overrideUserInterfaceStyle = .unspecified
        window.frame = scene.coordinateSpace.bounds
        screen.accessibilityIdentifier = "domus.launchCover"
        screen.isUserInteractionEnabled = true
        screen.frame = window.bounds
        screen.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.rootViewController = controller
        coverWindow = window
        window.isHidden = false
        window.layoutIfNeeded()
        screen.layoutIfNeeded()
        logAttachment(source: "installed")
        DispatchQueue.main.async { [weak self] in self?.logAttachment(source: "nextMainTurn") }
    }

    func logAttachment(source: String) {
        LaunchDiagnostics.fact("cover.attachmentSource", source)
        guard let window = coverWindow, let screen = cover else {
            LaunchDiagnostics.fact("cover.windowExists", "false")
            return
        }
        let normalWindows = window.windowScene?.windows.filter {
            !$0.isHidden && $0.alpha > 0 && $0.windowLevel >= .normal && $0.windowLevel < .alert
        }.sorted { $0.windowLevel < $1.windowLevel } ?? []
        LaunchDiagnostics.fact("cover.windowExists", String(screen.window === window))
        LaunchDiagnostics.fact("cover.sceneExists", String(window.windowScene != nil))
        LaunchDiagnostics.fact("cover.frame", NSCoder.string(for: window.frame))
        LaunchDiagnostics.fact("cover.viewFrame", NSCoder.string(for: screen.frame))
        LaunchDiagnostics.fact("cover.frameNonzero", String(!window.frame.isEmpty && !screen.frame.isEmpty))
        LaunchDiagnostics.fact("cover.isHidden", String(window.isHidden))
        LaunchDiagnostics.fact("cover.viewHidden", String(screen.isHidden))
        LaunchDiagnostics.fact("cover.alpha", String(Double(window.alpha)))
        LaunchDiagnostics.fact("cover.viewAlpha", String(Double(screen.alpha)))
        LaunchDiagnostics.fact("cover.clipsToBounds", String(window.clipsToBounds))
        LaunchDiagnostics.fact("cover.style", String(screen.traitCollection.userInterfaceStyle.rawValue))
        LaunchDiagnostics.fact("cover.frontmostNormal", String(normalWindows.last === window))
    }

    func evaluateLock(enabled: Bool, phase: AppLock.Phase?, lockWindow: UIWindow?, appWindow: UIWindow?,
                      notification: Notification? = nil, source: String) {
        let visibility = LaunchLockVisibility(enabled: enabled, phase: phase, windowExists: lockWindow != nil,
            appScene: appWindow?.windowScene.map(ObjectIdentifier.init),
            lockScene: lockWindow?.windowScene.map(ObjectIdentifier.init), hidden: lockWindow?.isHidden ?? true,
            alpha: lockWindow?.alpha ?? 0)
        let ignored: String?
        if let notification, notification.name == UIWindow.didBecomeVisibleNotification
            || notification.name == UIWindow.didBecomeKeyNotification {
            if let candidate = notification.object as? UIWindow, candidate === lockWindow {
                ignored = visibility.sameScene ? nil : "notification scene differs or missing"
            } else { ignored = "notification window is not our lock window" }
        } else if let notification {
            if let scene = notification.object as? UIWindowScene, scene === appWindow?.windowScene {
                ignored = nil
            } else { ignored = "notification scene differs or missing" }
        } else { ignored = nil }
        evaluateLock(visibility, notificationRejection: ignored, source: source)
    }

    func evaluateLock(_ visibility: LaunchLockVisibility, notificationRejection: String? = nil, source: String) {
        LaunchDiagnostics.fact("lock.candidateSource", source)
        LaunchDiagnostics.fact("lock.enabled", String(visibility.enabled))
        LaunchDiagnostics.fact("lock.phase", visibility.phaseName)
        LaunchDiagnostics.fact("lock.windowExists", String(visibility.windowExists))
        LaunchDiagnostics.fact("lock.sameScene", String(visibility.sameScene))
        LaunchDiagnostics.fact("lock.sceneExists", String(visibility.lockScene != nil))
        LaunchDiagnostics.fact("lock.isHidden", String(visibility.hidden))
        LaunchDiagnostics.fact("lock.alpha", String(Double(visibility.alpha)))
        logAttachment(source: source)
        let reason = notificationRejection ?? visibility.rejection
        if let reason {
            LaunchDiagnostics.fact("gate.event", "lockShown candidate")
            LaunchDiagnostics.fact("gate.source", source)
            LaunchDiagnostics.fact("gate.ignored", reason)
            return
        }
        send(.lockShown, source: source)
    }

    func send(_ event: LaunchSplashGate.Event, source: String = "direct") {
        LaunchDiagnostics.fact("gate.event", event.label)
        LaunchDiagnostics.fact("gate.source", source)
        guard gate.send(event) else {
            LaunchDiagnostics.fact("gate.result", gate.isOpen ? "already open" : "waiting")
            return
        }
        LaunchDiagnostics.fact("gate.removalReason", gate.removalReason!.rawValue)
        guard let window = coverWindow else { return }
        // Immediate removal also lets the lock become interactive in this same turn.
        window.isHidden = true
        window.rootViewController = nil
        coverWindow = nil
        removalCount += 1
        removedOnMainThread = Thread.isMainThread
    }
}
