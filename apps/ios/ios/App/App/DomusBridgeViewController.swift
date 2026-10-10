import Capacitor
import WebKit

final class DomusBridgeViewController: CAPBridgeViewController {
    private var navigationHandler: DomusNavigationDelegate?

    override func capacitorDidLoad() {
        guard let webView, let bridge,
              let original = webView.navigationDelegate as? NSObject else { return }
        let downloads = DownloadHandler(presenter: DownloadPresenter(viewController: self))
        let handler = DomusNavigationDelegate(original: original, downloads: downloads,
                                              offlineURL: bridge.config.errorPathURL,
                                              startupURL: bridge.config.serverURL,
                                              mainWebView: webView)
        navigationHandler = handler
        webView.navigationDelegate = handler
        webView.uiDelegate = handler
        webView.configuration.userContentController.add(handler, name: "domusShareCsv")
    }

    func reloadAfterConnectIfNeeded() {
        navigationHandler?.reloadAfterConnectIfNeeded()
    }
}
