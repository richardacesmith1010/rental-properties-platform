import UIKit
import WebKit

@MainActor
protocol NavigationOpening {
    func openNavigationURL(_ url: URL)
}

@MainActor
protocol MainWebViewLoading: AnyObject {
    func loadMainRequest(_ request: URLRequest)
    func reloadMainView()
}

extension UIApplication: NavigationOpening {
    func openNavigationURL(_ url: URL) { open(url) }
}

extension WKWebView: MainWebViewLoading {
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
    private var awaitingStartup = true
    private let opener: NavigationOpening
    private weak var mainWebView: MainWebViewLoading?
    private(set) var pendingConnect = false

    init(original: NSObject, downloads: DownloadHandler, offlineURL: URL?, startupURL: URL,
         mainWebView: MainWebViewLoading, opener: NavigationOpening? = nil) {
        self.original = original
        self.downloads = downloads
        self.offlineURL = offlineURL
        self.startupURL = startupURL
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
        let mainFrame = action.targetFrame?.isMainFrame ?? true
        let url = action.request.url
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
            if action.shouldPerformDownload {
                decisionHandler(.download)
            } else {
                // WKUIDelegate routes blank targets back into the main web view.
                decisionHandler(.allow)
            }
        case .openExternal, .system:
            decisionHandler(.cancel)
            openOutsideApp(url)
        case .reject:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard response.isForMainFrame else { decisionHandler(.allow); return }
        // Recheck final responses, including redirect destinations.
        let result = decision(for: response.response.url, mainFrame: true)
        guard result == .allowInApp || response.response.url == startupURL else {
            decisionHandler(.cancel)
            if result == .openExternal || result == .system, let url = response.response.url {
                openOutsideApp(url)
            }
            return
        }
        decisionHandler(DownloadHandler.isDownload(response.response) ? .download : .allow)
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
            openOutsideApp(url)
        case .reject:
            break
        }
        return nil
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        (original as? WKNavigationDelegate)?.webView?(webView, didCommit: navigation)
    }

    private func openOutsideApp(_ url: URL?) {
        guard let url else { return }
        if NavigationPolicy.decide(url: url, isMainFrame: true) == .openExternal,
           url.scheme?.lowercased() == "https", url.host?.lowercased() == "connect.stripe.com" {
            pendingConnect = true
        }
        opener.openNavigationURL(url)
    }

    func reloadAfterConnectIfNeeded() {
        guard pendingConnect else { return }
        pendingConnect = false
        mainWebView?.reloadMainView()
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        downloads.attach(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        downloads.attach(download)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailure(webView, error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailure(webView, error: error)
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
        // UA is not authorization. Restrict this file-sharing bridge to the actual main-frame origin.
        guard message.name == "domusShareCsv", message.frameInfo.isMainFrame,
              origin.protocol == "https", origin.host == "domusbase.com", [0, 443].contains(origin.port),
              let body = message.body as? [String: Any],
              let filename = body["filename"] as? String, filename.lowercased().hasSuffix(".csv"),
              let csv = body["csv"] as? String else { return }
        downloads.shareCsv(filename: filename, csv: csv)
    }
}
