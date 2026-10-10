import XCTest
import WebKit
@testable import App

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
        startupURL: URL(string: "https://domusbase.com/login")!, mainWebView: loader, opener: opener
    )

    private func blankTarget(_ url: String, method: String = "GET") {
        var request = URLRequest(url: URL(string: url)!)
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
        XCTAssertEqual(loader.reloads, 1)
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertEqual(loader.reloads, 1)
        blankTarget("https://connect.stripe.com/another-onboarding")
        delegate.reloadAfterConnectIfNeeded()
        XCTAssertEqual(loader.reloads, 2)
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
        XCTAssertEqual(loader.reloads, 1)
    }

    private func decideAction(_ url: String) {
        let action = BlankTargetAction(URLRequest(url: URL(string: url)!))
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
}

@MainActor
private final class MainViewSpy: MainWebViewLoading {
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
