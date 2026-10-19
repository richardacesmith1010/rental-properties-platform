import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.overrideUserInterfaceStyle = ThemeStore.load()
        let bridge = DomusBridgeViewController()
        bridge.appWindow = window
        window?.rootViewController = bridge
        bridge.loadViewIfNeeded()
        window?.makeKeyAndVisible()
        if let cover = bridge.appLockController?.lockWindow, !cover.isHidden { cover.makeKey() }
        Self.routeColdStart(connectionOptions.userActivities, active: bridge.plaidLinkBridge?.isActive == true,
                            load: { bridge.webView?.load(URLRequest(url: $0)) })

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    private var appLock: AppLockController? {
        (window?.rootViewController as? DomusBridgeViewController)?.appLockController
    }
    func sceneWillResignActive(_ scene: UIScene) { appLock?.send(.willResignActive) }
    func sceneDidEnterBackground(_ scene: UIScene) { appLock?.send(.didEnterBackground) }
    func sceneDidBecomeActive(_ scene: UIScene) { appLock?.send(.didBecomeActive) }
    func sceneWillEnterForeground(_ scene: UIScene) { appLock?.send(.willEnterForeground) }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        handle(userActivity) { SceneDelegateProxy.shared.scene(scene, continue: userActivity) }
    }

    static func routeColdStart(_ activities: Set<NSUserActivity>, active: Bool, load: (URL) -> Void) {
        // willConnectTo's proxy forwards cold activities after capacitorViewDidAppear.
        for activity in activities { route(activity, active: active, load: load, forward: {}) }
    }

    private func handle(_ activity: NSUserActivity, forward: () -> Void) {
        let bridge = window?.rootViewController as? DomusBridgeViewController
        Self.route(activity, active: bridge?.plaidLinkBridge?.isActive == true,
                   load: { bridge?.webView?.load(URLRequest(url: $0)) }, forward: forward)
    }

    static func isPlaidReturn(_ activity: NSUserActivity) -> Bool {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb, let url = activity.webpageURL else { return false }
        return MessageProvenance.trustedURL(url) && url.port == nil
            && URLComponents(url: url, resolvingAgainstBaseURL: false)?.path == "/owner/bank/oauth-app"
    }

    static func route(_ activity: NSUserActivity, active: Bool, load: (URL) -> Void, forward: () -> Void) {
        if isPlaidReturn(activity) {
            // LinkKit 7.2.2's public PlaidLinkSession exposes open(using:) and sheet(), no OAuth continuation API.
            // https://plaid.com/docs/link/ios/#standard-link: retain the session for the entire Link flow.
            // The SDK handles OAuth itself; do not navigate or manufacture a resume call.
            if active { return }
            if let url = URL(string: "https://domusbase.com/owner/bank") { load(url) }
        }
        // Capacitor 8.5.3 CAPSceneDelegateProxy.scene(_:continue:) posts capacitorOpenUniversalLink.
        // CAPApplicationDelegateProxy does likewise; AppPlugin.handleUniversalLink emits appUrlOpen.
        // Suppress this competing navigation channel only for an active Plaid OAuth return.
        // Source: node_modules/@capacitor/ios/Capacitor/Capacitor/CAPSceneDelegateProxy.swift
        forward()
    }
}
