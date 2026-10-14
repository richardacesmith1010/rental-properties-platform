import UIKit
import WebKit

@MainActor
final class AppLockController {
    private(set) var lock: AppLock
    let overlay = LockViewController()
    private weak var host: UIViewController?
    private weak var webView: WKWebView?
    private let biometrics: BiometricAuthenticating
    private let cookies: AuthCookies
    private let reloadConnect: () -> Void
    private var active = false
    private var background = false
    private var enableAttempt: UUID?
    private var committedURL: URL?
    private var documentID = UUID()
    private var offer: UIAlertController?

    init(host: UIViewController, webView: WKWebView, settings: LockSettingsStoring,
         biometrics: BiometricAuthenticating, cookies: AuthCookies, reloadConnect: @escaping () -> Void) {
        self.host = host
        self.webView = webView
        self.biometrics = biometrics
        self.cookies = cookies
        self.reloadConnect = reloadConnect
        lock = AppLock(settings: settings, kind: biometrics.availability().kind)
    }

    func install() {
        guard let host, let webView else { return }
        host.addChild(overlay)
        overlay.view.translatesAutoresizingMaskIntoConstraints = false
        host.view.addSubview(overlay.view)
        NSLayoutConstraint.activate([
            overlay.view.topAnchor.constraint(equalTo: host.view.topAnchor),
            overlay.view.bottomAnchor.constraint(equalTo: host.view.bottomAnchor),
            overlay.view.leadingAnchor.constraint(equalTo: host.view.leadingAnchor),
            overlay.view.trailingAnchor.constraint(equalTo: host.view.trailingAnchor)
        ])
        overlay.didMove(toParent: host)
        overlay.view.isHidden = true
        webView.accessibilityElementsHidden = false
        overlay.unlock = { [weak self] in self?.send(.unlockTapped) }
        overlay.password = { [weak self] in self?.send(.passwordTapped) }
        send(.coldLaunch)
        cookies.observed = { [weak self] in self?.send(.authCookieObserved($0)) }
        cookies.observe()
    }

    func send(_ event: AppLock.Event) {
        switch event {
        case .willResignActive: active = false
        case .didEnterBackground:
            active = false
            background = true
            enableAttempt = nil
            offer?.dismiss(animated: false)
            offer = nil
        case .didBecomeActive: active = true; background = false
        case .passwordTapped: enableAttempt = nil
        default: break
        }
        for effect in lock.send(event, attempt: UUID()) {
            switch effect {
            case .showCover: show(cover: true)
            case .showLockView: overlay.showMessage(nil); show(cover: false)
            case .hideOverlay:
                overlay.view.isHidden = true
                webView?.accessibilityElementsHidden = false
                UIAccessibility.post(notification: .screenChanged, argument: nil)
            case let .startBiometric(id):
                biometrics.authenticate(reason: "Open Domus") { [weak self] in self?.send(.biometricResult(id, $0)) }
            case let .showMessage(message): overlay.showMessage(message)
            case .signOutToLogin:
                enableAttempt = nil
                show(cover: false)
                webView?.stopLoading()
                cookies.signOut { [weak self] ok in self?.send(.signOutFinished(ok)) }
            case .runPendingConnectReload:
                if lock.phase == .open { reloadConnect() }
            case .saveSettings: break // The injected settings store persists each assignment.
            }
        }
        if lock.phase == .open && !active {
            switch event {
            case .biometricResult, .signOutFinished:
                send(background ? .didEnterBackground : .willResignActive)
            default: break
            }
        }
        overlay.display(cover: lock.phase == .covered, busy: lock.phase == .signingOut, kind: lock.kind)
        if active && lock.phase == .open { offerIfNeeded() }
    }

    private func show(cover: Bool) {
        overlay.view.isHidden = false
        host?.view.bringSubviewToFront(overlay.view)
        webView?.accessibilityElementsHidden = true
        overlay.display(cover: cover, busy: lock.phase == .signingOut, kind: lock.kind)
        UIAccessibility.post(notification: .screenChanged, argument: overlay.view)
    }

    func mainFrameCommitted(_ url: URL) {
        committedURL = url
        documentID = UUID()
        enableAttempt = nil
        cookies.committed(url)
        cookies.read { [weak self] in
            guard let self, self.active, self.lock.phase == .open else { return }
            self.offerIfNeeded()
        }
    }

    func navigationFailed() { cookies.navigationFailed() }

    private func offerIfNeeded() {
        guard offer == nil, enableAttempt == nil, let url = committedURL, lock.settings.signedIn,
              shouldOfferFaceId(offered: lock.settings.offered, biometricsAvailable: biometrics.availability().available,
                                url: url), let host, host.presentedViewController == nil else { return }
        let kind = biometrics.availability().kind
        lock.kind = kind
        let message = kind == .touchId ? "Next time, just touch the sensor to open Domus."
            : "Next time, just look at your phone to open Domus."
        let alert = UIAlertController(title: "Open Domus with \(kind.title)?", message: message, preferredStyle: .alert)
        // Mark before presenting, so lifecycle callbacks cannot present a second offer.
        _ = lock.send(.offerAnswered, attempt: UUID())
        let use = UIAlertAction(title: "Use \(kind.title)", style: .default) { [weak self] _ in
            self?.offer = nil
            self?.enable { }
        }
        alert.addAction(use)
        alert.preferredAction = use
        alert.addAction(UIAlertAction(title: "Not now", style: .cancel) { [weak self] _ in self?.offer = nil })
        offer = alert
        host.present(alert, animated: true)
    }

    private func enable(completion: @escaping () -> Void) {
        guard enableAttempt == nil, lock.phase == .open || lock.phase == .covered else { completion(); return }
        let id = UUID()
        enableAttempt = id
        biometrics.authenticate(reason: "Open Domus") { [weak self] result in
            guard let self, self.enableAttempt == id else { return }
            self.enableAttempt = nil
            if case let .success(state) = result { self.send(.enableConfirmed(state)) }
            completion()
        }
    }

    func message(_ request: FaceIdRequest) {
        let document = documentID
        let reply = { [weak self] in
            guard let self, self.documentID == document,
                  MessageProvenance.trustedURL(self.webView?.url) else { return }
            let availability = self.biometrics.availability()
            guard let script = FaceIdRequest.reply(requestId: request.requestId, available: availability.available,
                                                   enabled: self.lock.settings.enabled, kind: availability.kind) else { return }
            self.webView?.evaluateJavaScript(script, completionHandler: nil)
        }
        guard lock.phase == .open else { reply(); return }
        switch request.action {
        case "enable": enable(completion: reply)
        case "disable": enableAttempt = nil; send(.disableRequested); reply()
        default: reply()
        }
    }
}
