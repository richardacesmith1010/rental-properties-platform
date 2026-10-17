import XCTest
import WebKit
@testable import App

@MainActor
final class LaunchSplashTests: XCTestCase {
    private let login = URL(string: "https://domusbase.com/login")!
    private let owner = URL(string: "https://domusbase.com/owner")!

    func testSuccessBeforeTimeoutAndDuplicateSourcesRemoveOnlyOnce() {
        var timer: (@MainActor @Sendable () -> Void)?
        let adapter = LaunchCoverAdapter { delay, work in
            XCTAssertEqual(delay, 12)
            timer = work
        }
        let host = UIView()
        adapter.install(in: host)
        adapter.startWatchdog()
        let nav = NSObject()
        adapter.send(.mainFrameRequested(login))
        adapter.send(.started(nav))
        adapter.send(.finished(nav, mainFrame: true))
        adapter.send(.finished(nav, mainFrame: true))
        timer?()
        XCTAssertEqual(adapter.removalCount, 1)
        XCTAssertTrue(host.subviews.isEmpty)
    }

    func testWatchdogWithoutCallbacksThenSuccessIsANoop() {
        var timer: (@MainActor @Sendable () -> Void)?
        let adapter = LaunchCoverAdapter { _, work in timer = work }
        let host = UIView()
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

    private func bridge(locked: Bool = false) -> SplashTestBridge {
        let controller = SplashTestBridge()
        let settings = FakeLockSettings()
        settings.enabled = locked
        controller.lockSettings = settings
        controller.loadViewIfNeeded()
        return controller
    }

    func testRealBridgeInstallsBeforeFirstLoadAndRemovesOnMainThreadOnce() throws {
        let controller = bridge()
        let cover = try XCTUnwrap(controller.launchCover.cover)
        XCTAssertTrue(controller.coverPresentAtLoad)
        XCTAssertTrue(cover.superview === controller.view)
        let nav = NSObject()
        let delegate = try XCTUnwrap(controller.webView?.navigationDelegate as? DomusNavigationDelegate)
        delegate.recordMainFrameRequest(login)
        delegate.handleStartedMainFrame(navigation: nav)
        delegate.handleFinishedMainFrame(navigation: nav)
        controller.launchCover.send(.watchdog)
        XCTAssertNil(cover.superview)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
        XCTAssertTrue(controller.launchCover.removedOnMainThread)
    }

    func testRealBridgeOpenBeforeInstallNeverAddsCover() {
        let controller = SplashTestBridge()
        let settings = FakeLockSettings()
        settings.enabled = false
        controller.lockSettings = settings
        controller.launchCover.send(.lockShown)
        controller.loadViewIfNeeded()
        XCTAssertFalse(controller.coverPresentAtLoad)
        XCTAssertNil(controller.launchCover.cover)
        XCTAssertEqual(controller.launchCover.removalCount, 0)
        XCTAssertFalse(controller.view.subviews.contains { $0.accessibilityIdentifier == "domus.launchCover" })
    }

    func testRealCapacitorNetworkFailureLoadsOfflineAndOnlyItsFinishOpens() throws {
        let controller = bridge()
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
    }

    func testOfflineProvisionalFailureDoesNotReloadAndWatchdogReleases() throws {
        let controller = bridge()
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
            let controller = bridge()
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
            let controller = bridge()
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

    func testLockEnabledColdLaunchYieldsBeforePageLoad() {
        let controller = bridge(locked: true)
        XCTAssertEqual(controller.appLockController?.lock.phase, .locked)
        XCTAssertTrue(controller.launchCover.gate.isOpen)
        XCTAssertFalse(controller.coverPresentAtLoad)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
    }

    func testLockEnabledWarmLaunchYieldsAndDoesNotReinstall() throws {
        let controller = bridge()
        controller.lockSettings.enabled = true
        controller.lockSettings.signedIn = true
        let lock = try XCTUnwrap(controller.appLockController)
        lock.send(.didEnterBackground)
        NotificationCenter.default.post(name: UIScene.didEnterBackgroundNotification, object: nil)
        XCTAssertTrue(controller.launchCover.gate.isOpen)
        NotificationCenter.default.post(name: UIScene.willEnterForegroundNotification, object: nil)
        XCTAssertEqual(lock.lock.phase, .locked)
        XCTAssertTrue(controller.launchCover.gate.isOpen)
        controller.launchCover.install(in: controller.view)
        XCTAssertNil(controller.launchCover.cover)
        XCTAssertEqual(controller.launchCover.removalCount, 1)
    }

    func testBackgroundAndFaceIdLifecycleNeverRestartWatchdogOrReinstall() {
        var schedules = 0
        let adapter = LaunchCoverAdapter { _, _ in schedules += 1 }
        let controller = bridge()
        let host = UIView()
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
        XCTAssertEqual(host.subviews.count, 1)
        adapter.send(.lockShown)
        adapter.install(in: host)
        XCTAssertTrue(host.subviews.isEmpty)
    }
}

/// Inherits the real bridge lifecycle; only the WebKit transport is replaced.
@MainActor
private final class SplashTestBridge: DomusBridgeViewController {
    var coverPresentAtLoad = false
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let web = SplashTestWebView(frame: frame, configuration: configuration)
        web.beforeLoad = { [weak self] in self?.coverPresentAtLoad = self?.launchCover.cover?.superview != nil }
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
