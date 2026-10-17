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

class DomusBridgeViewController: CAPBridgeViewController {
    private var navigationHandler: DomusNavigationDelegate?

    private(set) var plaidLinkBridge: PlaidLinkBridge?
    weak var appWindow: UIWindow?
    private(set) var appLockController: AppLockController?
    let launchCover = LaunchCoverAdapter()
    var lockSettings: LockSettingsStoring = LockSettings()

    override func viewDidLoad() {
        launchCover.startWatchdog()
        launchCover.install(in: view)
        NotificationCenter.default.addObserver(self, selector: #selector(lockWindowShown(_:)),
                                               name: UIWindow.didBecomeVisibleNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(lockWindowShown(_:)),
                                               name: UIWindow.didBecomeKeyNotification, object: nil)
        for name in [UIScene.didEnterBackgroundNotification, UIScene.willEnterForegroundNotification] {
            NotificationCenter.default.addObserver(self, selector: #selector(launchSceneChanged), name: name, object: nil)
        }
        // Install the scene's lock window before Capacitor starts loading the web page.
        if let webView {
            let cookies = AuthCookies(store: WKWebsiteDataStore.default().httpCookieStore) { [weak webView] url in
                webView?.load(URLRequest(url: url))
            }
            let controller = AppLockController(host: self, webView: webView, settings: lockSettings,
                                               biometrics: BiometricAuth(), cookies: cookies) { [weak self] in
                self?.reloadAfterConnectIfNeeded()
            }
            appLockController = controller
            controller.install(window: appWindow)
            yieldLaunchCoverToLock()
            plaidLinkBridge = PlaidLinkBridge(presenter: self, cookies: webView.configuration.websiteDataStore.httpCookieStore,
                document: { [weak controller] in controller?.documentID ?? UUID() },
                signingOut: { [weak controller] in controller?.lock.phase == .signingOut },
                currentURL: { [weak webView] in webView?.url },
                evaluate: { [weak webView] in webView?.evaluateJavaScript($0, completionHandler: nil) })
        }
        // The lock window is already installed before Capacitor starts its initial load.
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
        handler.onLaunchEvent = { [weak self] in self?.launchCover.send($0) }
        handler.onMainFrameCommit = { [weak self] in self?.appLockController?.mainFrameCommitted($0) }
        handler.onNavigationFailure = { [weak self] in self?.appLockController?.navigationFailed() }
        handler.onPlaidLink = { [weak self] in self?.plaidLinkBridge?.open($0) }
        handler.onFaceId = { [weak self] in self?.appLockController?.message($0) }
        navigationHandler = handler
        webView.navigationDelegate = handler
        webView.uiDelegate = handler
        webView.configuration.userContentController.add(handler, name: "domusShareCsv")
        webView.configuration.userContentController.add(handler, name: "domusFaceId")
        webView.configuration.userContentController.add(handler, name: "domusPlaidLink")
    }

    @objc private func launchSceneChanged() {
        yieldLaunchCoverToLock()
    }

    @objc private func lockWindowShown(_ notification: Notification) {
        guard let window = notification.object as? UIWindow,
              window === appLockController?.lockWindow else { return }
        yieldLaunchCoverToLock()
    }

    private func yieldLaunchCoverToLock() {
        guard let lock = appLockController?.lock else { return }
        switch lock.phase {
        case .locked, .authenticating, .signingOut: launchCover.send(.lockShown)
        case .open, .covered: break
        }
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
