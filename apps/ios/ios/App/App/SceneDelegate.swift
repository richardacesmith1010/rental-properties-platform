import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = DomusBridgeViewController()
        window?.makeKeyAndVisible()

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
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
