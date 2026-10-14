import UIKit
import WebKit

@MainActor
protocol NavigationOpening {
    func openNavigationURL(_ url: URL)
}

@MainActor
protocol MainWebViewLoading: AnyObject {
    var mainURL: URL? { get }
    func loadMainRequest(_ request: URLRequest)
    func reloadMainView()
}

extension UIApplication: NavigationOpening {
    func openNavigationURL(_ url: URL) { open(url) }
}

extension WKWebView: MainWebViewLoading {
    var mainURL: URL? { url }
    func loadMainRequest(_ request: URLRequest) { load(request) }
    func reloadMainView() { reload() }
}

/// A delegate proxy preserves Capacitor's bridge reset, loading, dialogs, and auth callbacks.
/// Only navigation decisions, new windows, downloads and cancellation handling are replaced.
@MainActor
final class DomusNavigationDelegate: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let original: NSObject
    private let downloads: DownloadHandler
    private let offlineURL: URL?
    private let startupURL: URL
    private let serverHost: String
    private(set) var lastSafeURL: URL
    private var committedNavigation: AnyObject?
    private var previousSafeURL: URL?
    private let failedNavigations = NSHashTable<AnyObject>.weakObjects()
    private var navigatingConnect = false
    private var awaitingStartup = true
    private let opener: NavigationOpening
    private weak var mainWebView: MainWebViewLoading?
    private(set) var pendingConnect = false
    var onMainFrameCommit: ((URL) -> Void)?
    var onNavigationFailure: (() -> Void)?
    var onPlaidLink: ((PlaidLinkRequest) -> Void)?
    var onFaceId: ((FaceIdRequest) -> Void)?

    init(original: NSObject, downloads: DownloadHandler, offlineURL: URL?, startupURL: URL,
         mainWebView: MainWebViewLoading, opener: NavigationOpening? = nil,
         serverHost: String = "domusbase.com") {
        self.original = original
        self.downloads = downloads
        self.offlineURL = offlineURL
        self.startupURL = startupURL
        self.serverHost = serverHost.lowercased()
        self.lastSafeURL = Self.isSafeURL(startupURL, host: serverHost.lowercased(), offlineURL: offlineURL)
            ? startupURL : (URL(string: "https://domusbase.com/login") ?? startupURL)
        self.mainWebView = mainWebView
        self.opener = opener ?? UIApplication.shared
    }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || original.responds(to: selector)
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        original.responds(to: selector) ? original : super.forwardingTarget(for: selector)
    }

    private func decision(for url: URL?, mainFrame: Bool) -> NavigationPolicy.Decision {
        // Only Capacitor's exact bundled error document may use its internal scheme.
        if let url, let offlineURL, url == offlineURL { return .allowInApp }
        return NavigationPolicy.decide(url: url, isMainFrame: mainFrame)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        handleNavigationAction(url: action.request.url, mainFrame: action.targetFrame?.isMainFrame ?? true,
                               shouldPerformDownload: action.shouldPerformDownload, decisionHandler: decisionHandler)
    }

    func handleNavigationAction(url: URL?, mainFrame: Bool, shouldPerformDownload: Bool = false,
                                decisionHandler: (WKNavigationActionPolicy) -> Void) {
        if mainFrame, let url, url.host?.lowercased() == serverHost {
            navigatingConnect = Self.isConnectPath(url)
        }
        // A developer-configured startup URL is loaded once, never an added host wildcard.
        // This also allows the unreachable-host offline test. Subsequent navigations use policy.
        if awaitingStartup && mainFrame && url == startupURL {
            awaitingStartup = false
            decisionHandler(.allow)
            return
        }
        if mainFrame && NavigationPolicy.isDomusBlob(url) {
            decisionHandler(.download)
            return
        }
        switch decision(for: url, mainFrame: mainFrame) {
        case .allowInApp:
            if shouldPerformDownload {
                decisionHandler(.download)
            } else {
                // WKUIDelegate routes blank targets back into the main web view.
                decisionHandler(.allow)
            }
        case .openExternal, .system:
            decisionHandler(.cancel)
            openOutsideApp(url, mainFrame: mainFrame)
        case .reject:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard response.isForMainFrame else { decisionHandler(.allow); return }
        handleMainFrameResponse(url: response.response.url, isDownload: DownloadHandler.isDownload(response.response),
                                decisionHandler: decisionHandler)
    }

    func handleMainFrameResponse(url: URL?, isDownload: Bool = false,
                                 decisionHandler: (WKNavigationResponsePolicy) -> Void) {
        // Recheck final responses, including redirect destinations.
        let result = decision(for: url, mainFrame: true)
        guard result == .allowInApp || url == startupURL else {
            decisionHandler(.cancel)
            if result == .openExternal || result == .system, let url {
                openOutsideApp(url, mainFrame: true)
            }
            return
        }
        decisionHandler(isDownload ? .download : .allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = action.request.url
        switch decision(for: url, mainFrame: true) {
        case .allowInApp:
            guard let url else { return nil }
            // WebKit may omit POST bodies for blank targets. Fall back to GET explicitly.
            let request = (action.request.httpMethod ?? "GET").uppercased() == "GET"
                ? action.request : URLRequest(url: url)
            mainWebView?.loadMainRequest(request)
        case .openExternal, .system:
            openOutsideApp(url, mainFrame: true)
        case .reject:
            break
        }
        return nil
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        handleCommittedMainFrame(url: webView.url, navigation: navigation)
        (original as? WKNavigationDelegate)?.webView?(webView, didCommit: navigation)
    }

    // WebKit supplies navigation identities; tests use ordinary objects with the same lifetime.
    // Commit/finish callbacks describe the main frame only.
    func handleCommittedMainFrame(url: URL?, navigation: AnyObject?) {
        if let url { onMainFrameCommit?(url) }
        if let navigation, let url, !failedNavigations.contains(navigation),
           Self.isSafeURL(url, host: serverHost, offlineURL: offlineURL) {
            if committedNavigation !== navigation { previousSafeURL = lastSafeURL }
            committedNavigation = navigation
            lastSafeURL = url
            navigatingConnect = false
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        handleFinishedMainFrame(navigation: navigation)
        (original as? WKNavigationDelegate)?.webView?(webView, didFinish: navigation)
    }

    func handleFinishedMainFrame(navigation: AnyObject?) {
        if let navigation, committedNavigation === navigation {
            previousSafeURL = nil
            committedNavigation = nil
        }
    }

    private static func isConnectPath(_ url: URL) -> Bool {
        let path = url.standardized.path
        return path == "/connect" || path.hasPrefix("/connect/")
    }

    private static func isSafeURL(_ url: URL?, host: String, offlineURL: URL?) -> Bool {
        guard let url, url.baseURL == nil, url != offlineURL,
              url.scheme?.lowercased() == "https", url.host?.lowercased() == host,
              host != "stripe.com", !host.hasSuffix(".stripe.com"),
              url.user == nil, url.password == nil, !url.absoluteString.contains("\\") else { return false }
        let path = url.standardized.path
        return !isConnectPath(url) && path != "/auth" && !path.hasPrefix("/auth/")
    }

    private func openOutsideApp(_ url: URL?, mainFrame: Bool) {
        guard let url else { return }
        if mainFrame, NavigationPolicy.decide(url: url, isMainFrame: true) == .openExternal,
           url.scheme?.lowercased() == "https", url.host?.lowercased() == "connect.stripe.com" {
            // Action/response/new-window callbacks can refer to the same handoff.
            guard !pendingConnect else { return }
            pendingConnect = true
            opener.openNavigationURL(url)
            // WebKit may still report the prior URL during a provisional Connect redirect.
            // A blank target can leave an already usable page intact.
            if navigatingConnect || !Self.isSafeURL(mainWebView?.mainURL, host: serverHost, offlineURL: offlineURL) {
                navigatingConnect = false
                mainWebView?.loadMainRequest(URLRequest(url: lastSafeURL))
            }
            return
        }
        opener.openNavigationURL(url)
    }

    func reloadAfterConnectIfNeeded() {
        guard pendingConnect else { return }
        pendingConnect = false
        mainWebView?.loadMainRequest(URLRequest(url: lastSafeURL))
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        downloads.attach(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        downloads.attach(download)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailedNavigation(webView, navigation: navigation, error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailedNavigation(webView, navigation: navigation, error: error)
    }

    func handleFailedNavigation(_ webView: WKWebView, navigation: AnyObject?, error: Error) {
        onNavigationFailure?()
        discardFailedNavigation(navigation)
        handleFailure(webView, error: error)
    }

    private func discardFailedNavigation(_ navigation: AnyObject?) {
        guard let navigation else { return }
        failedNavigations.add(navigation)
        if committedNavigation === navigation {
            lastSafeURL = previousSafeURL ?? lastSafeURL
            previousSafeURL = nil
            committedNavigation = nil
        }
    }

    private func handleFailure(_ webView: WKWebView, error: Error) {
        let error = error as NSError
        // Cancelling navigation for Safari or WKDownload must keep the current page intact.
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return }
        if error.domain == "WebKitErrorDomain" && error.code == 102 { return }
        webView.isOpaque = true
        if let offlineURL, webView.url != offlineURL { webView.load(URLRequest(url: offlineURL)) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        handleMessage(name: message.name, body: message.body, mainFrame: message.frameInfo.isMainFrame,
                      scheme: origin.protocol, host: origin.host, port: origin.port, currentURL: message.webView?.url)
    }

    func handleMessage(name: String, body: Any, mainFrame: Bool, scheme: String, host: String, port: Int, currentURL: URL?) {
        guard MessageProvenance.accepts(mainFrame: mainFrame, scheme: scheme, host: host, port: port,
                                        currentURL: currentURL) else { return }
        if name == "domusPlaidLink" {
            if let request = PlaidLinkRequest(body: body) { onPlaidLink?(request) }
        } else if name == "domusFaceId" {
            if let request = FaceIdRequest(body: body) { onFaceId?(request) }
        } else if name == "domusShareCsv", let body = body as? [String: Any],
                  let filename = body["filename"] as? String, filename.lowercased().hasSuffix(".csv"),
                  let csv = body["csv"] as? String {
            downloads.shareCsv(filename: filename, csv: csv)
        }
    }
}

enum MessageProvenance {
    static func trustedURL(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.host == "domusbase.com" && (url.port == nil || url.port == 443)
            && url.user == nil && url.password == nil
    }
    static func accepts(mainFrame: Bool, scheme: String, host: String, port: Int, currentURL: URL?) -> Bool {
        mainFrame && scheme == "https" && host == "domusbase.com" && [0, 443].contains(port) && trustedURL(currentURL)
    }
}

struct FaceIdRequest {
    let action: String
    let requestId: String
    init?(body: Any) {
        guard let body = body as? [String: Any], let action = body["action"] as? String,
              ["get", "enable", "disable"].contains(action), let id = body["requestId"] as? String,
              id.utf16.count <= 64 else { return nil }
        self.action = action
        requestId = id
    }
    static func reply(requestId: String, available: Bool, enabled: Bool, kind: BiometricKind) -> String? {
        let body: [String: Any] = ["requestId": requestId, "available": available, "enabled": enabled, "kind": kind.rawValue]
        guard let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return "window.dispatchEvent(new CustomEvent('domus-face-id',{detail:" + json + "}))"
    }
}
