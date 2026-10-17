import XCTest
import WebKit
@testable import App

@MainActor
final class LaunchSplashTests: XCTestCase {
    private let login = URL(string: "https://domusbase.com/login")!
    private let owner = URL(string: "https://domusbase.com/owner")!

    func testSuccessBeforeTimeoutAndDuplicateSourcesRemoveOnlyOnce() throws {
        var timer: (@MainActor @Sendable () -> Void)?
        let adapter = LaunchCoverAdapter { delay, work in
            XCTAssertEqual(delay, 12)
            timer = work
        }
        let host = try window()
        adapter.install(in: host)
        adapter.startWatchdog()
        let nav = NSObject()
        adapter.send(.mainFrameRequested(login))
        adapter.send(.started(nav))
        adapter.send(.finished(nav, mainFrame: true))
        adapter.send(.finished(nav, mainFrame: true))
        timer?()
        XCTAssertEqual(adapter.removalCount, 1)
        XCTAssertNil(adapter.coverWindow)
    }

    func testWatchdogWithoutCallbacksThenSuccessIsANoop() throws {
        var timer: (@MainActor @Sendable () -> Void)?
        let adapter = LaunchCoverAdapter { _, work in timer = work }
        let host = try window()
        adapter.install(in: host)
        adapter.startWatchdog()
        timer?()
        adapter.send(.finished(NSObject(), mainFrame: true))
        XCTAssertEqual(adapter.removalCount, 1)
    }

    func testSubframeAndStaleFinishNeverOpen() {
        var gate = LaunchSplashGate()
        let old = NSObject(), current = NSObject()
        XCTAssertFalse(gate.send(.started(old)))
        XCTAssertFalse(gate.send(.mainFrameRequested(owner)))
        XCTAssertFalse(gate.send(.finished(old, mainFrame: true)))
        XCTAssertFalse(gate.send(.started(current)))
        XCTAssertFalse(gate.send(.finished(old, mainFrame: true)))
        XCTAssertFalse(gate.send(.finished(current, mainFrame: false)))
        XCTAssertTrue(gate.send(.finished(current, mainFrame: true)))
    }

    func testLoginServerRedirectFinishesOnceAtOwner() {
        var gate = LaunchSplashGate()
        let nav = NSObject()
        XCTAssertFalse(gate.send(.mainFrameRequested(login)))
        XCTAssertFalse(gate.send(.started(nav)))
        // HTTP 307 keeps the same WKNavigation, with no intermediate finish.
        XCTAssertFalse(gate.send(.mainFrameRequested(owner)))
        XCTAssertFalse(gate.send(.committed(nav, owner)))
        XCTAssertTrue(gate.send(.finished(nav, mainFrame: true)))
        XCTAssertFalse(gate.send(.watchdog))
    }

    private var windows: [UIWindow] = []
    private var controllers: [SplashTestBridge] = []
    private weak var priorKeyWindow: UIWindow?

    private func window() throws -> UIWindow {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        if windows.isEmpty { priorKeyWindow = scene.windows.first(where: \.isKeyWindow) }
        let window = UIWindow(windowScene: scene)
        window.frame = scene.coordinateSpace.bounds
        windows.append(window)
        return window
    }

    override func tearDown() {
        for controller in controllers {
            controller.launchCover.send(.watchdog)
            controller.appLockController?.lockWindow?.isHidden = true
        }
        for window in windows { window.isHidden = true; window.rootViewController = nil }
        controllers.removeAll()
        windows.removeAll()
        priorKeyWindow?.makeKeyAndVisible()
        super.tearDown()
    }

    private func bridge(locked: Bool = false) throws -> SplashTestBridge {
        let controller = SplashTestBridge()
        let settings = FakeLockSettings()
        settings.enabled = locked
        controller.lockSettings = settings
        let host = try window()
        controller.appWindow = host
        controllers.append(controller)
        host.rootViewController = controller
        controller.loadViewIfNeeded()
        return controller
    }

    func testRealBridgeInstallsBeforeFirstLoadAndRemovesOnMainThreadOnce() throws {
        let controller = try bridge()
        let cover = try XCTUnwrap(controller.launchCover.cover)
        XCTAssertTrue(controller.coverPresentAtLoad)
        let window = try XCTUnwrap(controller.launchCover.coverWindow)
        let scene = try XCTUnwrap(controller.appWindow?.windowScene)
        XCTAssertFalse(cover.isDescendant(of: controller.view))
        XCTAssertTrue(cover.window === window)
        XCTAssertTrue(window.windowScene === scene)
        XCTAssertEqual(window.windowLevel, .normal + 1)
        XCTAssertFalse(window.canBecomeKey)
        XCTAssertFalse(window.isKeyWindow)
        XCTAssertFalse(window.isHidden)
        XCTAssertEqual(window.frame, scene.coordinateSpace.bounds)
        XCTAssertFalse(window.frame.isEmpty)
        XCTAssertEqual(window.overrideUserInterfaceStyle, .unspecified)
        let nav = NSObject()
        let delegate = try XCTUnwrap(controller.webView?.navigationDelegate as? DomusNavigationDelegate)
        delegate.recordMainFrameRequest(login)
        delegate.handleStartedMainFrame(navigation: nav)
        delegate.handleFinishedMainFrame(navigation: nav)
        controller.launchCover.send(.watchdog)
        XCTAssertTrue(window.isHidden)
        XCTAssertNil(window.rootViewController)
        XCTAssertNil(controller.launchCover.coverWindow)
        XCTAssertEqual(controller.launchCover.gate.removalReason, .finished)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
        XCTAssertTrue(controller.launchCover.removedOnMainThread)
    }

    func testRealBridgeOpenBeforeInstallNeverAddsCover() throws {
        let controller = SplashTestBridge()
        let settings = FakeLockSettings()
        settings.enabled = false
        controller.lockSettings = settings
        let host = try window()
        controller.appWindow = host
        controller.launchCover.send(.lockShown)
        host.rootViewController = controller
        controllers.append(controller)
        controller.loadViewIfNeeded()
        XCTAssertFalse(controller.coverPresentAtLoad)
        XCTAssertNil(controller.launchCover.cover)
        XCTAssertEqual(controller.launchCover.removalCount, 0)
        XCTAssertFalse(controller.view.subviews.contains { $0.accessibilityIdentifier == "domus.launchCover" })
    }

    func testRealCapacitorNetworkFailureLoadsOfflineAndOnlyItsFinishOpens() throws {
        let controller = try bridge()
        let web = try XCTUnwrap(controller.webView as? SplashTestWebView)
        let delegate = try XCTUnwrap(web.navigationDelegate as? DomusNavigationDelegate)
        let online = NSObject(), offline = NSObject()
        delegate.recordMainFrameRequest(login)
        delegate.handleStartedMainFrame(navigation: online)
        delegate.handleFailedNavigation(web, navigation: online,
            error: NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet), provisional: true)
        let errorURL = try XCTUnwrap(controller.bridge?.config.errorPathURL)
        XCTAssertEqual(web.requests.last?.url, errorURL) // Real Capacitor handler, fake transport only.
        XCTAssertFalse(controller.launchCover.gate.isOpen)
        delegate.handleFinishedMainFrame(navigation: online)
        XCTAssertFalse(controller.launchCover.gate.isOpen)
        delegate.recordMainFrameRequest(errorURL)
        delegate.handleStartedMainFrame(navigation: offline)
        delegate.handleFinishedMainFrame(navigation: offline)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
        XCTAssertEqual(controller.launchCover.gate.removalReason, .offlineFinished)
    }

    func testOfflineProvisionalFailureDoesNotReloadAndWatchdogReleases() throws {
        let controller = try bridge()
        let web = try XCTUnwrap(controller.webView as? SplashTestWebView)
        let delegate = try XCTUnwrap(web.navigationDelegate as? DomusNavigationDelegate)
        let offline = NSObject()
        delegate.recordMainFrameRequest(controller.bridge?.config.errorPathURL)
        delegate.handleStartedMainFrame(navigation: offline)
        let count = web.requests.count // URL is still nil: provisional failures must use the tracked request.
        delegate.handleFailedNavigation(web, navigation: offline,
            error: NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist), provisional: true)
        XCTAssertEqual(web.requests.count, count)
        delegate.handleFinishedMainFrame(navigation: offline)
        XCTAssertFalse(controller.launchCover.gate.isOpen)
        controller.launchCover.send(.watchdog)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
    }

    func testCancelledInterruptedAndSupersededFailuresWaitForCurrentSuccess() throws {
        for error in [NSError(domain: NSURLErrorDomain, code: -999), NSError(domain: "WebKitErrorDomain", code: 102),
                      NSError(domain: NSURLErrorDomain, code: NSURLErrorNetworkConnectionLost)] {
            let controller = try bridge()
            let web = try XCTUnwrap(controller.webView as? SplashTestWebView)
            let delegate = try XCTUnwrap(web.navigationDelegate as? DomusNavigationDelegate)
            let old = NSObject(), current = NSObject()
            delegate.recordMainFrameRequest(login)
            delegate.handleStartedMainFrame(navigation: old)
            delegate.recordMainFrameRequest(owner)
            delegate.handleStartedMainFrame(navigation: current)
            let count = web.requests.count
            delegate.handleFailedNavigation(web, navigation: old, error: error)
            delegate.handleFinishedMainFrame(navigation: old)
            XCTAssertEqual(web.requests.count, count)
            XCTAssertFalse(controller.launchCover.gate.isOpen)
            delegate.handleFinishedMainFrame(navigation: current)
            XCTAssertEqual(controller.launchCover.removalCount, 1)
        }
    }

    func testCurrentCancellationNeverOpensOrLoadsOffline() throws {
        for error in [NSError(domain: NSURLErrorDomain, code: -999), NSError(domain: "WebKitErrorDomain", code: 102)] {
            let controller = try bridge()
            let web = try XCTUnwrap(controller.webView as? SplashTestWebView)
            let delegate = try XCTUnwrap(web.navigationDelegate as? DomusNavigationDelegate)
            let cancelled = NSObject(), next = NSObject()
            delegate.handleStartedMainFrame(navigation: cancelled)
            let count = web.requests.count
            delegate.handleFailedNavigation(web, navigation: cancelled, error: error)
            delegate.handleFinishedMainFrame(navigation: cancelled)
            XCTAssertFalse(controller.launchCover.gate.isOpen)
            XCTAssertEqual(web.requests.count, count)
            delegate.handleStartedMainFrame(navigation: next)
            delegate.handleFinishedMainFrame(navigation: next)
            XCTAssertEqual(controller.launchCover.removalCount, 1)
        }
    }

    func testLockEnabledColdLaunchYieldsBeforePageLoad() throws {
        let controller = try bridge(locked: true)
        XCTAssertEqual(controller.appLockController?.lock.phase, .locked)
        XCTAssertTrue(controller.launchCover.gate.isOpen)
        XCTAssertFalse(controller.coverPresentAtLoad)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
    }

    func testLockEnabledWarmLaunchYieldsAndDoesNotReinstall() throws {
        let controller = try bridge()
        controller.lockSettings.enabled = true
        controller.lockSettings.signedIn = true
        let lock = try XCTUnwrap(controller.appLockController)
        lock.send(.didEnterBackground)
        NotificationCenter.default.post(name: UIScene.didEnterBackgroundNotification, object: controller.appWindow?.windowScene)
        XCTAssertTrue(controller.launchCover.gate.isOpen)
        NotificationCenter.default.post(name: UIScene.willEnterForegroundNotification, object: controller.appWindow?.windowScene)
        XCTAssertEqual(lock.lock.phase, .locked)
        XCTAssertTrue(controller.launchCover.gate.isOpen)
        controller.launchCover.install(in: controller.appWindow)
        XCTAssertNil(controller.launchCover.cover)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
    }

    func testBackgroundAndFaceIdLifecycleNeverRestartWatchdogOrReinstall() throws {
        var schedules = 0
        let adapter = LaunchCoverAdapter { _, _ in schedules += 1 }
        let controller = try bridge()
        let host = try window()
        let originalCover = controller.launchCover.cover
        adapter.install(in: host)
        adapter.startWatchdog()
        for event in [AppLock.Event.willResignActive, .didEnterBackground, .willEnterForeground, .didBecomeActive] {
            controller.appLockController?.send(event)
            adapter.startWatchdog()
            adapter.install(in: host)
            XCTAssertTrue(controller.launchCover.cover === originalCover)
            XCTAssertFalse(controller.launchCover.gate.isOpen)
        }
        XCTAssertEqual(schedules, 1)
        XCTAssertNotNil(adapter.coverWindow)
        adapter.send(.lockShown)
        adapter.install(in: host)
        XCTAssertNil(adapter.coverWindow)
    }

    func testLockOffLaunchNotificationsNeverOpenGate() throws {
        let controller = try bridge()
        controller.appLockController?.send(.willResignActive) // Actual privacy cover, even with lock disabled.
        XCTAssertEqual(controller.appLockController?.lock.phase, .covered)
        for name in [UIScene.willEnterForegroundNotification, UIScene.didEnterBackgroundNotification] {
            NotificationCenter.default.post(name: name, object: controller.appWindow?.windowScene)
            XCTAssertFalse(controller.launchCover.gate.isOpen)
        }
        for name in [UIWindow.didBecomeVisibleNotification, UIWindow.didBecomeKeyNotification] {
            for candidate in [controller.appWindow, controller.appLockController?.lockWindow] {
                NotificationCenter.default.post(name: name, object: candidate)
                XCTAssertFalse(controller.launchCover.gate.isOpen)
            }
        }
    }

    func testLockRequiresEnabledVisibleSameSceneWindowAndLockingPhase() throws {
        let host = try window(), lockWindow = try window()
        let adapter = LaunchCoverAdapter()
        adapter.install(in: host)
        func evaluate(_ enabled: Bool = true, _ phase: AppLock.Phase = .locked) {
            adapter.evaluateLock(enabled: enabled, phase: phase, lockWindow: lockWindow,
                                 appWindow: host, source: "testCandidate")
        }
        evaluate() // Hidden.
        XCTAssertFalse(adapter.gate.isOpen)
        lockWindow.isHidden = false
        lockWindow.alpha = 0
        evaluate()
        XCTAssertFalse(adapter.gate.isOpen)
        lockWindow.alpha = 1
        evaluate(false)
        XCTAssertFalse(adapter.gate.isOpen)
        for phase in [AppLock.Phase.open, .covered, .signingOut] {
            evaluate(true, phase)
            XCTAssertFalse(adapter.gate.isOpen)
        }
        let scene = try XCTUnwrap(host.windowScene)
        let foreignSceneIdentity = NSObject()
        var foreign = LaunchLockVisibility(enabled: true, phase: .locked, windowExists: true,
            appScene: ObjectIdentifier(scene), lockScene: ObjectIdentifier(foreignSceneIdentity), hidden: false, alpha: 1)
        adapter.evaluateLock(foreign, source: "foreignScene")
        XCTAssertFalse(adapter.gate.isOpen)
        foreign.lockScene = nil
        adapter.evaluateLock(foreign, source: "missingScene")
        XCTAssertFalse(adapter.gate.isOpen)
        lockWindow.windowScene = nil
        evaluate()
        XCTAssertFalse(adapter.gate.isOpen)
        lockWindow.windowScene = scene
        lockWindow.isHidden = false
        XCTAssertFalse(lockWindow.isKeyWindow)
        evaluate()
        XCTAssertTrue(adapter.gate.isOpen)
        XCTAssertEqual(adapter.gate.removalReason, .lockShown)
        XCTAssertEqual(adapter.removalCount, 1)
    }

    func testForeignWindowAndInvalidSceneNotificationsCannotYieldVisibleLock() throws {
        let host = try window(), lockWindow = try window(), foreignWindow = try window()
        lockWindow.isHidden = false
        let otherScene = NSObject() // Non-scene objects must also be rejected, never treated as our scene.
        let adapter = LaunchCoverAdapter()
        adapter.install(in: host)
        for name in [UIWindow.didBecomeVisibleNotification, UIWindow.didBecomeKeyNotification] {
            adapter.evaluateLock(enabled: true, phase: .locked, lockWindow: lockWindow, appWindow: host,
                                 notification: Notification(name: name, object: foreignWindow), source: "foreignWindow")
            XCTAssertFalse(adapter.gate.isOpen)
        }
        for name in [UIScene.willEnterForegroundNotification, UIScene.didEnterBackgroundNotification] {
            adapter.evaluateLock(enabled: true, phase: .locked, lockWindow: lockWindow, appWindow: host,
                                 notification: Notification(name: name, object: otherScene), source: "foreignScene")
            XCTAssertFalse(adapter.gate.isOpen)
        }
        adapter.evaluateLock(enabled: true, phase: .authenticating(attempt: UUID()), lockWindow: lockWindow,
                             appWindow: host, notification: Notification(name: UIWindow.didBecomeVisibleNotification,
                             object: lockWindow), source: "ownVisibleLock")
        XCTAssertEqual(adapter.gate.removalReason, .lockShown)
        XCTAssertEqual(adapter.removalCount, 1)
    }

    func testCompetingEventsAllOrdersRemoveOnceAndKeepFirstReason() throws {
        let nav = NSObject()
        let events: [LaunchSplashGate.Event] = [.finished(nav, mainFrame: true), .watchdog, .lockShown]
        let reasons: [LaunchSplashGate.RemovalReason] = [.finished, .watchdog, .lockShown]
        for order in [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] {
            let adapter = LaunchCoverAdapter()
            adapter.install(in: try window())
            adapter.send(.started(nav))
            for index in order {
                adapter.send(events[index])
                XCTAssertEqual(adapter.removalCount, 1)
                XCTAssertEqual(adapter.gate.removalReason, reasons[order[0]])
                XCTAssertTrue(adapter.removedOnMainThread)
                XCTAssertNil(adapter.coverWindow)
            }
        }
    }

    func testNoBlackFallbackIsConfiguredBeforeLoadInLightAndDark() throws {
        for initialStyle in [UIUserInterfaceStyle.light, .dark] {
            let controller = SplashTestBridge()
            controller.lockSettings = FakeLockSettings()
            controller.lockSettings.enabled = false
            let host = try window()
            host.overrideUserInterfaceStyle = initialStyle
            controller.appWindow = host
            controllers.append(controller)
            host.rootViewController = controller
            controller.loadViewIfNeeded()
            let web = try XCTUnwrap(controller.webView as? SplashTestWebView)
            XCTAssertTrue(controller.backgroundsReadyAtLoad)
            controller.launchCover.send(.watchdog)
            host.isHidden = false
            for style in [initialStyle, .light, .dark, .light] {
                host.overrideUserInterfaceStyle = style
                if #available(iOS 17.0, *) { host.updateTraitsIfNeeded() }
                host.layoutIfNeeded()
                XCTAssertEqual(controller.traitCollection.userInterfaceStyle, style)
                XCTAssertFalse(web.isOpaque)
                let traits = controller.traitCollection
                let backgrounds = [web.backgroundColor, web.scrollView.backgroundColor,
                                   web.underPageBackgroundColor, host.backgroundColor]
                for background in backgrounds {
                    XCTAssertTrue(splashColorsMatch(background, .systemBackground, traits: traits), "Style: \(style)")
                    let rgba = try XCTUnwrap(splashRGBA(background, traits: traits))
                    for component in [rgba.red, rgba.green, rgba.blue] {
                        if style == .light { XCTAssertGreaterThan(component, 0.9) }
                        else { XCTAssertLessThan(component, 0.1) }
                    }
                    XCTAssertEqual(rgba.alpha, 1, accuracy: 0.001)
                }
            }
        }
    }

    func testMissingWindowOrSceneKeepsFallbackAndWaitsForDeadline() throws {
        for host in [nil, UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))] {
            let controller = SplashTestBridge()
            controller.lockSettings = FakeLockSettings()
            controller.lockSettings.enabled = false
            controller.appWindow = host
            controller.loadViewIfNeeded()
            XCTAssertNil(controller.launchCover.coverWindow)
            XCTAssertFalse(controller.launchCover.gate.isOpen)
            XCTAssertFalse(try XCTUnwrap(controller.webView).isOpaque)
            XCTAssertEqual(controller.webView?.backgroundColor, UIColor.systemBackground)
            if let host { XCTAssertEqual(host.backgroundColor, UIColor.systemBackground) }
            controller.launchCover.send(.watchdog)
            XCTAssertEqual(controller.launchCover.gate.removalReason, .watchdog)
            XCTAssertEqual(controller.launchCover.removalCount, 0)
        }
    }

}

private func splashRGBA(_ color: UIColor?, traits: UITraitCollection) -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat)? {
    guard let color = color?.resolvedColor(with: traits) else { return nil }
    var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
    if color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) { return (red, green, blue, alpha) }
    var white: CGFloat = 0
    guard color.getWhite(&white, alpha: &alpha) else { return nil }
    return (white, white, white, alpha)
}

private func splashColorsMatch(_ actual: UIColor?, _ expected: UIColor, traits: UITraitCollection) -> Bool {
    guard let actual = splashRGBA(actual, traits: traits), let expected = splashRGBA(expected, traits: traits) else { return false }
    return abs(actual.red - expected.red) < 0.001 && abs(actual.green - expected.green) < 0.001
        && abs(actual.blue - expected.blue) < 0.001 && abs(actual.alpha - expected.alpha) < 0.001
}

/// Inherits the real bridge lifecycle; only the WebKit transport is replaced.
@MainActor
private final class SplashTestBridge: DomusBridgeViewController {
    var coverPresentAtLoad = false
    var backgroundsReadyAtLoad = false
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let web = SplashTestWebView(frame: frame, configuration: configuration)
        web.beforeLoad = { [weak self, weak web] in
            guard let self, let web else { return }
            self.coverPresentAtLoad = self.launchCover.coverWindow?.isHidden == false
            self.backgroundsReadyAtLoad = !web.isOpaque
                && [web.backgroundColor, web.scrollView.backgroundColor, web.underPageBackgroundColor, self.appWindow?.backgroundColor]
                    .allSatisfy { splashColorsMatch($0, .systemBackground, traits: self.traitCollection) }
        }
        return web
    }
}

@MainActor
private final class SplashTestWebView: WKWebView {
    var requests: [URLRequest] = []
    var beforeLoad: (() -> Void)?
    override func load(_ request: URLRequest) -> WKNavigation? {
        beforeLoad?()
        requests.append(request)
        return nil
    }
}
