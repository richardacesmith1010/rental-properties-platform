import Capacitor
import WebKit
import UIKit

enum InspectionPolicy {
    #if DEBUG
    static let enabled = true
    #else
    static let enabled = false
    #endif
}

final class DomusBridgeViewController: CAPBridgeViewController {
    private var navigationHandler: DomusNavigationDelegate?

    private(set) var appLockController: AppLockController?
    var lockSettings: LockSettingsStoring = LockSettings()

    override func viewDidLoad() {
        // Capacitor uses the WKWebView as its root. Give the overlay a sibling container,
        // so hiding web accessibility does not also hide the lock's accessible controls.
        if let webView {
            let container = UIView(frame: webView.frame)
            view = container
            webView.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(webView)
            NSLayoutConstraint.activate([
                webView.topAnchor.constraint(equalTo: container.topAnchor),
                webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
                webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                webView.trailingAnchor.constraint(equalTo: container.trailingAnchor)
            ])
            let cookies = AuthCookies(store: WKWebsiteDataStore.default().httpCookieStore) { [weak webView] url in
                webView?.load(URLRequest(url: url))
            }
            let controller = AppLockController(host: self, webView: webView, settings: lockSettings,
                                               biometrics: BiometricAuth(), cookies: cookies) { [weak self] in
                self?.reloadAfterConnectIfNeeded()
            }
            appLockController = controller
            controller.install()
        }
        // The overlay is already in the hierarchy before Capacitor starts its initial load.
        super.viewDidLoad()
    }

    override func capacitorDidLoad() {
        if #available(iOS 16.4, *) {
            webView?.isInspectable = InspectionPolicy.enabled
        }
        guard let webView, let bridge,
              let original = webView.navigationDelegate as? NSObject else { return }
        let downloads = DownloadHandler(presenter: DownloadPresenter(viewController: self))
        let handler = DomusNavigationDelegate(original: original, downloads: downloads,
                                              offlineURL: bridge.config.errorPathURL,
                                              startupURL: bridge.config.appStartServerURL,
                                              mainWebView: webView,
                                              serverHost: bridge.config.serverURL.host ?? "domusbase.com")
        handler.onMainFrameCommit = { [weak self] in self?.appLockController?.mainFrameCommitted($0) }
        handler.onNavigationFailure = { [weak self] in self?.appLockController?.navigationFailed() }
        handler.onFaceId = { [weak self] in self?.appLockController?.message($0) }
        navigationHandler = handler
        webView.navigationDelegate = handler
        webView.uiDelegate = handler
        webView.configuration.userContentController.add(handler, name: "domusShareCsv")
        webView.configuration.userContentController.add(handler, name: "domusFaceId")
    }

    func reloadAfterConnectIfNeeded() {
        navigationHandler?.reloadAfterConnectIfNeeded()
    }
}

// Cookie operations stay in WebKit. No credentials are copied to another store.
@MainActor
protocol AuthCookieStoring: AnyObject {
    func getAllCookies(_ completion: @escaping @MainActor @Sendable ([HTTPCookie]) -> Void)
    func delete(_ cookie: HTTPCookie, completionHandler: (@MainActor @Sendable () -> Void)?)
}
extension WKHTTPCookieStore: AuthCookieStoring {}

@MainActor
final class AuthCookies: NSObject, WKHTTPCookieStoreObserver {
    private let store: AuthCookieStoring
    private let load: (URL) -> Void
    private let schedule: (TimeInterval, @escaping @MainActor @Sendable () -> Void) -> Void
    var observed: ((Bool) -> Void)?
    private var readID = UUID()
    private var transaction: UUID?
    private var waitingForLogin = false
    private var completion: ((Bool) -> Void)?

    init(store: AuthCookieStoring, load: @escaping (URL) -> Void,
         schedule: @escaping (TimeInterval, @escaping @MainActor @Sendable () -> Void) -> Void = { delay, work in
             DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
         }) {
        self.store = store
        self.load = load
        self.schedule = schedule
    }

    static func matches(_ cookie: HTTPCookie) -> Bool {
        (cookie.domain == "domusbase.com" || cookie.domain == ".domusbase.com")
            && cookie.name.range(of: #"^sb-[a-z0-9]+-auth-token(\.[0-9]+)?$"#, options: .regularExpression) != nil
    }

    func observe() {
        (store as? WKHTTPCookieStore)?.add(self)
        read()
    }
    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) { read() }
    func read(completion: @escaping () -> Void = {}) {
        let id = UUID()
        readID = id
        store.getAllCookies { [weak self] cookies in
            guard let self, self.readID == id else { return }
            self.observed?(cookies.contains(where: Self.matches))
            completion()
        }
    }

    func signOut(completion: @escaping (Bool) -> Void) {
        let id = UUID()
        transaction = id
        readID = UUID()
        waitingForLogin = false
        self.completion = completion
        schedule(10) { [weak self] in self?.finish(false, id: id) }
        store.getAllCookies { [weak self] cookies in
            guard let self, self.transaction == id else { return }
            let group = DispatchGroup()
            for cookie in cookies.filter(Self.matches) {
                group.enter()
                self.store.delete(cookie) { group.leave() }
            }
            group.notify(queue: .main) { [weak self] in
                guard let self, self.transaction == id else { return }
                // WebKit's delete callback has no error parameter; confirm deletion by reading.
                self.store.getAllCookies { [weak self] remaining in
                    guard let self, self.transaction == id else { return }
                    guard !remaining.contains(where: Self.matches), let url = URL(string: "https://domusbase.com/login") else {
                        self.finish(false, id: id)
                        return
                    }
                    self.waitingForLogin = true
                    self.load(url)
                }
            }
        }
    }

    func committed(_ url: URL) {
        guard let id = transaction, waitingForLogin, MessageProvenance.trustedURL(url), url.path == "/login" else { return }
        store.getAllCookies { [weak self] cookies in
            guard let self, self.transaction == id else { return }
            self.finish(!cookies.contains(where: Self.matches), id: id)
        }
    }
    func navigationFailed() {
        if let id = transaction { finish(false, id: id) }
    }
    private func finish(_ ok: Bool, id: UUID) {
        guard transaction == id else { return }
        transaction = nil
        readID = UUID()
        waitingForLogin = false
        let callback = completion
        completion = nil
        callback?(ok)
    }
}
