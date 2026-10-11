import XCTest
import WebKit
@testable import App

@MainActor
final class InspectionPolicyTests: XCTestCase {
    func testInspectionMatchesBuildAfterCapacitorDidLoad() throws {
        #if DEBUG
        XCTAssertTrue(InspectionPolicy.enabled)
        #else
        XCTAssertFalse(InspectionPolicy.enabled)
        #endif
        let controller = DomusBridgeViewController()
        // loadView calls capacitorDidLoad; viewDidLoad would navigate to the live server.
        controller.loadView()
        let webView = try XCTUnwrap(controller.webView)
        if #available(iOS 16.4, *) {
            XCTAssertEqual(webView.isInspectable, InspectionPolicy.enabled)
        }
    }
}

final class NavigationPolicyTests: XCTestCase {
    func testTopLevelDestinations() {
        let cases: [(String, NavigationPolicy.Decision)] = [
            ("https://domusbase.com/owner", .allowInApp),
            ("https://checkout.stripe.com/c/pay/x", .allowInApp),
            ("https://hooks.stripe.com/3d_secure", .allowInApp),
            ("https://pay.stripe.com/x", .allowInApp),
            ("https://connect.stripe.com/onboarding", .openExternal),
            ("https://example.com", .openExternal),
            ("https://www.domusbase.com", .openExternal),
            ("https://domusbase.com.evil.example", .openExternal),
            ("https://evil.domusbase.com", .openExternal),
            ("http://domusbase.com", .reject),
            ("http://checkout.stripe.com", .reject),
            ("http://example.com", .openExternal),
            ("mailto:help@example.com", .system),
            ("tel:+15551234567", .system),
            ("sms:+15551234567", .system),
            ("javascript:alert(1)", .reject),
            ("someapp://open", .reject),
            ("//domusbase.com/owner", .reject),
            ("https://", .reject),
            ("not a URL", .reject),
            ("https://domusbase.com@evil.example", .reject),
            ("https://evil.example@domusbase.com", .reject),
            ("https://domusbase.com./", .openExternal),
            ("capacitor://localhost/offline.html", .reject),
            ("blob:https://domusbase.com/id", .reject)
        ]
        for (value, expected) in cases {
            XCTAssertEqual(NavigationPolicy.decide(url: URL(string: value), isMainFrame: true), expected, value)
        }
        XCTAssertEqual(NavigationPolicy.decide(url: nil, isMainFrame: true), .reject)
    }

    func testSubframesAreUnrestricted() {
        for value in ["https://example.com/frame", "http://domusbase.com", "about:blank", "data:text/html,frame"] {
            XCTAssertEqual(NavigationPolicy.decide(url: URL(string: value), isMainFrame: false), .allowInApp)
        }
    }

    func testBlobDownloadExceptionIsExactOriginOnly() {
        XCTAssertTrue(NavigationPolicy.isDomusBlob(URL(string: "blob:https://domusbase.com/123")))
        for value in ["blob:https://domusbase.com.evil.example/id", "blob:http://domusbase.com/id", "blob:null/id"] {
            XCTAssertFalse(NavigationPolicy.isDomusBlob(URL(string: value)))
        }
    }

}

@MainActor
final class NavigationRoutingTests: XCTestCase {
    private let loader = MainViewSpy()
    private let opener = OpenerSpy()
    private let webView = WKWebView()
    private lazy var delegate = DomusNavigationDelegate(
        original: NSObject(), downloads: DownloadHandler(presenter: DownloadPresenter(viewController: UIViewController())), offlineURL: nil,
        startupURL: testURL("https://domusbase.com/login"), mainWebView: loader, opener: opener
    )

    private func blankTarget(_ url: String, method: String = "GET") {
        var request = URLRequest(url: testURL(url))
        request.httpMethod = method
        request.setValue("preserved", forHTTPHeaderField: "X-Test")
        if method != "GET" { request.httpBody = Data("payload".utf8) }
        let action = BlankTargetAction(request)
        XCTAssertNil(action.targetFrame)
        XCTAssertNil(delegate.webView(webView, createWebViewWith: WKWebViewConfiguration(),
                                      for: action, windowFeatures: WKWindowFeatures()))
    }

    func testBlankTargetDomusAndStripeLoadMainView() {
        for host in NavigationPolicy.hosts {
            blankTarget("https://\(host)/destination")
            XCTAssertEqual(loader.requests.last?.url?.host, host)
            XCTAssertEqual(loader.requests.last?.value(forHTTPHeaderField: "X-Test"), "preserved")
        }
        XCTAssertEqual(loader.requests.count, NavigationPolicy.hosts.count)
        XCTAssertTrue(opener.urls.isEmpty)
        XCTAssertFalse(delegate.pendingConnect)
    }

    func testNonGetBlankTargetsLoadURLWithGet() {
        for method in ["POST", "PUT", "DELETE"] {
            blankTarget("https://domusbase.com/destination?test=1", method: method)
            XCTAssertEqual(loader.requests.last?.httpMethod, "GET")
            XCTAssertNil(loader.requests.last?.httpBody)
            XCTAssertEqual(loader.requests.last?.url?.absoluteString, "https://domusbase.com/destination?test=1")
        }
    }

    func testExternalBlankTargetOpensSafariAndSystemSchemesUseHandler() {
        for url in ["https://example.com", "mailto:help@example.com", "tel:+15551234567", "sms:+15551234567"] {
            blankTarget(url)
            XCTAssertEqual(opener.urls.last?.absoluteString, url)
            XCTAssertFalse(delegate.pendingConnect)
        }
        XCTAssertEqual(opener.urls.count, 4)
        XCTAssertTrue(loader.requests.isEmpty)
    }

    func testRejectedBlankTargetDoesNothing() {
        for url in ["javascript:alert(1)", "someapp://open", "http://domusbase.com"] { blankTarget(url) }
        XCTAssertTrue(opener.urls.isEmpty)
        XCTAssertTrue(loader.requests.isEmpty)
        XCTAssertFalse(delegate.pendingConnect)
    }

    func testConnectBlankTargetReloadsMainViewOnlyOnceOnForeground() {
        blankTarget("https://connect.stripe.com/onboarding")
        XCTAssertTrue(delegate.pendingConnect)
        XCTAssertEqual(opener.urls.last?.host, "connect.stripe.com")
        XCTAssertEqual(loader.reloads, 0)
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertFalse(delegate.pendingConnect)
        XCTAssertEqual(loader.reloads, 0)
        XCTAssertEqual(loader.requests.count, 2)
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertEqual(loader.reloads, 0)
        XCTAssertEqual(loader.requests.count, 2)
        blankTarget("https://connect.stripe.com/another-onboarding")
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertEqual(loader.reloads, 0)
        XCTAssertEqual(loader.requests.count, 4)
    }

    func testNormalForegroundDoesNotReload() {
        delegate.reloadAfterConnectIfNeeded()
        blankTarget("https://domusbase.com/owner/settings")
        delegate.reloadAfterConnectIfNeeded()
        blankTarget("https://example.com")
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertEqual(loader.reloads, 0)
    }

    func testOnlyHttpsConnectExternalActionsSetPendingFlag() {
        for url in ["http://connect.stripe.com/onboarding", "https://connect.stripe.com.evil.example",
                    "https://example.com/connect/", "mailto:connect.stripe.com"] {
            decideAction(url)
            XCTAssertFalse(delegate.pendingConnect)
        }
        decideAction("https://connect.stripe.com/onboarding")
        XCTAssertTrue(delegate.pendingConnect)
        XCTAssertEqual(opener.urls.last?.host, "connect.stripe.com")
        delegate.reloadAfterConnectIfNeeded()
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertEqual(loader.reloads, 0)
        XCTAssertEqual(loader.requests.count, 2)
    }

    private func decideAction(_ url: String) {
        let action = BlankTargetAction(URLRequest(url: testURL(url)))
        delegate.webView(webView, decidePolicyFor: action) { policy in
            XCTAssertEqual(policy, .cancel)
        }
    }
}

@MainActor
private final class BlankTargetAction: WKNavigationAction {
    private let storedRequest: URLRequest
    init(_ request: URLRequest) {
        storedRequest = request
        super.init()
    }
    override var request: URLRequest { storedRequest }
    override var targetFrame: WKFrameInfo? { nil }
    override var shouldPerformDownload: Bool { false }
}

@MainActor
private final class MainViewSpy: MainWebViewLoading {
    var mainURL: URL?
    var requests: [URLRequest] = []
    var reloads = 0
    func loadMainRequest(_ request: URLRequest) { requests.append(request) }
    func reloadMainView() { reloads += 1 }
}

@MainActor
private final class OpenerSpy: NavigationOpening {
    var urls: [URL] = []
    func openNavigationURL(_ url: URL) { urls.append(url) }
}

@MainActor
final class ConnectReturnTests: XCTestCase {
    private let owner = testURL("https://domusbase.com/owner")
    private let start = testURL("https://domusbase.com/login")
    private let offline = testURL("capacitor://localhost/offline.html")
    private let loader = MainViewSpy()
    private let opener = OpenerSpy()
    private let webView = CommittedWebView()
    private let original = LifecycleSpy()
    private lazy var delegate = makeDelegate()

    private func makeDelegate(startup: URL? = nil, host: String = "domusbase.com") -> DomusNavigationDelegate {
        DomusNavigationDelegate(original: original,
            downloads: DownloadHandler(presenter: DownloadPresenter(viewController: UIViewController())),
            offlineURL: offline, startupURL: startup ?? start, mainWebView: loader, opener: opener,
            serverHost: host)
    }

    @discardableResult
    private func commit(_ url: URL, finish: Bool = true) -> NSObject {
        let navigation = NSObject()
        webView.currentURL = url
        loader.mainURL = url
        delegate.handleCommittedMainFrame(url: url, navigation: navigation)
        if finish { delegate.handleFinishedMainFrame(navigation: navigation) }
        return navigation
    }

    private func openConnect(mainFrame: Bool = true) {
        delegate.handleNavigationAction(url: testURL("https://connect.stripe.com/onboarding"),
                                        mainFrame: mainFrame) { policy in
            XCTAssertEqual(policy, mainFrame ? .cancel : .allow)
        }
    }

    private func assertCompletedFlow(expectedLoads: Int = 2) {
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertFalse(delegate.pendingConnect)
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertEqual(opener.urls.count, 1)
        XCTAssertEqual(loader.requests.count, expectedLoads)
        XCTAssertTrue(loader.requests.allSatisfy { $0.url == delegate.lastSafeURL })
        XCTAssertEqual(loader.reloads, 0)
        XCTAssertEqual(opener.urls.count + loader.requests.count + loader.reloads, 1 + expectedLoads)
    }

    func testMainFrameRedirectRecoversOwnerThenRefreshesExactlyOnce() {
        commit(owner)
        loader.mainURL = URL(string: "https://domusbase.com/connect/onboard")
        openConnect()
        XCTAssertTrue(delegate.pendingConnect)
        XCTAssertEqual(loader.requests.map(\.url), [owner])
        assertCompletedFlow()
    }

    func testSafariCancelledStillLeavesOwnerUsableWithoutReopeningStripe() {
        commit(owner)
        loader.mainURL = nil
        openConnect()
        XCTAssertEqual(loader.requests.map(\.url), [owner])
        // Switching back without completing onboarding follows the same foreground path.
        commit(owner)
        assertCompletedFlow()
    }

    func testProvisionalConnectRedirectRecoversEvenWhenWebViewStillReportsOwner() {
        commit(owner)
        delegate.handleNavigationAction(url: testURL("https://domusbase.com/connect/onboard"),
                                        mainFrame: true) { XCTAssertEqual($0, .allow) }
        XCTAssertEqual(loader.mainURL, owner)
        openConnect()
        XCTAssertEqual(loader.requests.map(\.url), [owner])
        assertCompletedFlow()
    }

    func testDuplicateActionResponseAndWindowCallbacksRecoverOnlyOnce() {
        commit(owner)
        loader.mainURL = URL(string: "https://domusbase.com/connect")
        openConnect()
        openConnect()
        let url = testURL("https://connect.stripe.com/onboarding")
        delegate.handleMainFrameResponse(url: url) { XCTAssertEqual($0, .cancel) }
        let action = BlankTargetAction(URLRequest(url: url))
        XCTAssertNil(delegate.webView(webView, createWebViewWith: WKWebViewConfiguration(),
                                      for: action, windowFeatures: WKWindowFeatures()))
        XCTAssertEqual(opener.urls.count, 1)
        XCTAssertEqual(loader.requests.count, 1)
        assertCompletedFlow()
    }

    func testResponseRedirectAlsoRecoversSafePage() {
        commit(owner)
        loader.mainURL = nil
        delegate.handleMainFrameResponse(url: testURL("https://connect.stripe.com/onboarding")) {
            XCTAssertEqual($0, .cancel)
        }
        XCTAssertEqual(loader.requests.map(\.url), [owner])
        assertCompletedFlow()
    }

    func testExistingUsablePageNeedsOnlyForegroundRefresh() {
        commit(owner)
        openConnect()
        XCTAssertTrue(loader.requests.isEmpty)
        assertCompletedFlow(expectedLoads: 1)
    }

    func testNoPriorPageRecoversConfiguredStart() {
        openConnect()
        XCTAssertEqual(delegate.lastSafeURL, start)
        XCTAssertEqual(loader.requests.map(\.url), [start])
        assertCompletedFlow()
    }

    func testUnsafeCommitsNeverReplaceOwner() {
        commit(owner)
        for value in ["https://domusbase.com/connect", "https://domusbase.com/connect/onboard",
                      "https://domusbase.com/owner/../connect/onboard", "https://domusbase.com/%63onnect/onboard",
                      "https://domusbase.com/connect/return", "https://domusbase.com/connect/refresh",
                      "https://domusbase.com/auth/callback", "https://domusbase.com/auth/refresh",
                      "http://domusbase.com/owner", "ftp://domusbase.com/owner",
                      "https://domusbase.com.evil.com/owner", "https://evil.domusbase.com/owner",
                      "https://connect.stripe.com/onboarding", "https://checkout.stripe.com/pay",
                      offline.absoluteString] {
            commit(testURL(value))
            XCTAssertEqual(delegate.lastSafeURL, owner, value)
        }
    }

    func testProvisionalFailureDoesNotPromoteURLIncludingLateCallbacks() {
        commit(owner)
        let failed = NSObject()
        webView.currentURL = URL(string: "https://domusbase.com/owner/settings")
        delegate.handleFailedNavigation(webView, navigation: failed,
                                        error: NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet))
        delegate.handleCommittedMainFrame(url: webView.url, navigation: failed)
        delegate.handleFinishedMainFrame(navigation: failed)
        XCTAssertEqual(delegate.lastSafeURL, owner)
        XCTAssertEqual(webView.loadedURLs, [offline])
    }

    func testFailureAfterCommitRestoresPreviousSafePage() {
        commit(owner)
        let failed = commit(testURL("https://domusbase.com/owner/settings"), finish: false)
        delegate.handleFailedNavigation(webView, navigation: failed,
                                        error: NSError(domain: NSURLErrorDomain, code: NSURLErrorNetworkConnectionLost))
        delegate.handleFinishedMainFrame(navigation: failed)
        XCTAssertEqual(delegate.lastSafeURL, owner)
        loader.mainURL = offline
        openConnect()
        assertCompletedFlow()
    }

    func testFailedInitialNavigationRetainsValidatedFallback() {
        let failed = commit(owner, finish: false)
        delegate.handleFailedNavigation(webView, navigation: failed,
                                        error: NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled))
        XCTAssertEqual(delegate.lastSafeURL, start)
        XCTAssertTrue(webView.loadedURLs.isEmpty)
    }

    func testSubframesNeitherLaunchConnectNorBecomeSafePages() {
        commit(owner)
        openConnect(mainFrame: false)
        delegate.handleNavigationAction(url: testURL("https://domusbase.com/tenant"),
                                        mainFrame: false) { XCTAssertEqual($0, .allow) }
        // Subframes never receive WKNavigationDelegate didCommit/didFinish callbacks.
        XCTAssertEqual(delegate.lastSafeURL, owner)
        XCTAssertFalse(delegate.pendingConnect)
        XCTAssertTrue(opener.urls.isEmpty)
        XCTAssertTrue(loader.requests.isEmpty)
    }

    func testInvalidStartURLsFallBackToProductionLogin() {
        for value in ["https://domusbase.com/connect", "https://domusbase.com/connect/onboard",
                      "https://domusbase.com/auth/callback", "http://domusbase.com/login",
                      "https://domusbase.com.evil.com/login", "https://connect.stripe.com/onboarding",
                      offline.absoluteString] {
            XCTAssertEqual(makeDelegate(startup: testURL(value)).lastSafeURL, start, value)
        }
        XCTAssertEqual(makeDelegate(startup: testURL("https://connect.stripe.com/onboarding"),
                                    host: "connect.stripe.com").lastSafeURL, start)
    }

    func testConfiguredServerHostAndStartupPathAreRespected() {
        let url = testURL("https://domusbase.invalid/custom-start")
        let configured = makeDelegate(startup: url, host: "domusbase.invalid")
        XCTAssertEqual(configured.lastSafeURL, url)
        webView.currentURL = owner
        configured.handleCommittedMainFrame(url: webView.url, navigation: NSObject())
        XCTAssertEqual(configured.lastSafeURL, url)
    }

    func testLifecycleCallbacksStillReachCapacitorDelegate() {
        // Optional navigation arguments let us exercise forwarding without constructing WebKit internals.
        delegate.webView(webView, didCommit: nil)
        delegate.webView(webView, didFinish: nil)
        XCTAssertEqual(original.commits, 1)
        XCTAssertEqual(original.finishes, 1)
    }

    func testNormalForegroundNeverLoadsEvenAfterSafeCommit() {
        delegate.reloadAfterConnectIfNeeded()
        commit(owner)
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertTrue(loader.requests.isEmpty)
        XCTAssertTrue(opener.urls.isEmpty)
    }
}

@MainActor
private final class CommittedWebView: WKWebView {
    var currentURL: URL?
    var loadedURLs: [URL] = []
    override var url: URL? { currentURL }
    override func load(_ request: URLRequest) -> WKNavigation? {
        if let url = request.url { loadedURLs.append(url) }
        return nil
    }
}

@MainActor
private final class LifecycleSpy: NSObject, WKNavigationDelegate {
    var commits = 0
    var finishes = 0
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { commits += 1 }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finishes += 1 }
}

@MainActor
private func testURL(_ value: String, file: StaticString = #filePath, line: UInt = #line) -> URL {
    guard let url = URL(string: value) else {
        XCTFail("Invalid test URL: \(value)", file: file, line: line)
        return URL(fileURLWithPath: "/invalid-test-url")
    }
    return url
}
