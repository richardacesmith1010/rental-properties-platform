import XCTest
import WebKit
import LocalAuthentication
@testable import App

@MainActor
final class FakeBiometrics: BiometricAuthenticating {
    var completions: [(BiometricResult) -> Void] = []
    func availability() -> (kind: BiometricKind, available: Bool) { (.faceId, true) }
    func authenticate(reason: String, completion: @escaping (BiometricResult) -> Void) {
        XCTAssertEqual(reason, "Open Domus")
        completions.append(completion)
    }
}

@MainActor
final class FakeCookies: AuthCookieStoring {
    var cookies: [HTTPCookie] = []
    var deleted: [String] = []
    var pendingDeletes: [() -> Void] = []
    var deferDeletes = false
    var failDeletion = false
    func getAllCookies(_ completion: @escaping @MainActor @Sendable ([HTTPCookie]) -> Void) { completion(cookies) }
    func delete(_ cookie: HTTPCookie, completionHandler: (@MainActor @Sendable () -> Void)?) {
        deleted.append(cookie.name)
        let finish = { [self] in
            if !failDeletion { cookies.removeAll { $0.name == cookie.name && $0.domain == cookie.domain } }
            completionHandler?()
        }
        if deferDeletes { pendingDeletes.append(finish) } else { finish() }
    }
    static func cookie(_ name: String = "sb-test-auth-token", domain: String = "domusbase.com") throws -> HTTPCookie {
        try XCTUnwrap(HTTPCookie(properties: [.name: name, .value: "synthetic-test", .domain: domain, .path: "/"]))
    }
}

@MainActor
final class AppLockControllerTests: XCTestCase {
    private var host = UIViewController()
    private var web = WKWebView()
    private var bio = FakeBiometrics()
    private var store = FakeCookies()
    private var settings = FakeLockSettings()
    private var reloads = 0
    private var pendingConnect = true
    private func controller() throws -> AppLockController {
        store.cookies = [try FakeCookies.cookie()]
        host.loadViewIfNeeded()
        host.view.addSubview(web)
        let cookies = AuthCookies(store: store, load: { _ in })
        let controller = AppLockController(host: host, webView: web, settings: settings,
                                           biometrics: bio, cookies: cookies) { [self] in
            if pendingConnect { reloads += 1; pendingConnect = false }
        }
        controller.install()
        return controller
    }
    func testBackgroundImmediateForegroundStaysCoveredUntilSuccess() throws {
        let c = try controller()
        c.send(.didEnterBackground)
        XCTAssertEqual(c.lock.phase, .locked)
        XCTAssertFalse(c.overlay.view.isHidden)
        c.send(.didBecomeActive)
        XCTAssertFalse(c.overlay.view.isHidden)
        XCTAssertTrue(web.accessibilityElementsHidden)
        bio.completions[0](.success(Data([1])))
        XCTAssertTrue(c.overlay.view.isHidden)
        XCTAssertFalse(web.accessibilityElementsHidden)
    }
    func testSuccessfulUnlockWhileInactiveRetainsPrivacyCover() throws {
        let c = try controller()
        c.send(.didBecomeActive)
        c.send(.willResignActive)
        bio.completions[0](.success(Data([1])))
        XCTAssertEqual(c.lock.phase, .covered)
        XCTAssertFalse(c.overlay.view.isHidden)
        XCTAssertTrue(web.accessibilityElementsHidden)
        c.send(.didBecomeActive)
        XCTAssertEqual(c.lock.phase, .open)
        XCTAssertTrue(c.overlay.view.isHidden)
    }
    func testStaleBiometricSuccessAfterNewBackgroundIsIgnored() throws {
        let c = try controller()
        c.send(.didBecomeActive)
        c.send(.didEnterBackground)
        bio.completions[0](.success(Data([1])))
        XCTAssertEqual(c.lock.phase, .locked)
        XCTAssertFalse(c.overlay.view.isHidden)
        c.send(.didBecomeActive)
        bio.completions[0](.success(Data([1])))
        XCTAssertFalse(c.overlay.view.isHidden)
    }
    private func checkInterruption() throws {
        settings.enabled = false
        let c = try controller()
        c.send(.didBecomeActive)
        settings.enabled = true
        for _ in 0..<3 {
            c.send(.willResignActive)
            XCTAssertEqual(c.lock.phase, .covered)
            XCTAssertTrue(web.accessibilityElementsHidden)
            c.send(.didBecomeActive)
            XCTAssertEqual(c.lock.phase, .open)
            XCTAssertTrue(c.overlay.view.isHidden)
        }
        XCTAssertTrue(bio.completions.isEmpty)
    }
    func testControlCenterAndSystemAlertsCoverOnly() throws { try checkInterruption() }
    func testCameraAndPhotoPickerCoverOnly() throws { try checkInterruption() }
    func testConnectReloadRunsExactlyOnceAfterUnlock() throws {
        let c = try controller()
        c.send(.didEnterBackground)
        c.send(.willEnterForeground)
        c.send(.didBecomeActive)
        XCTAssertEqual(reloads, 0)
        bio.completions[0](.success(Data([1])))
        XCTAssertEqual(reloads, 1)
        c.send(.didBecomeActive)
        XCTAssertEqual(reloads, 1)
    }
    func testColdLaunchOverlayInstalledWhenBridgeViewDidLoadCompletes() throws {
        // The test runner uses the bundled offline page, never the production server.
        let bridge = DomusBridgeViewController()
        bridge.lockSettings = settings
        bridge.loadViewIfNeeded()
        let c = try XCTUnwrap(bridge.appLockController)
        XCTAssertTrue(c.overlay.parent === bridge)
        XCTAssertTrue(c.overlay.view.superview === bridge.view)
        XCTAssertTrue(bridge.view.subviews.last === c.overlay.view)
        XCTAssertFalse(c.overlay.view.isHidden)
        XCTAssertEqual(c.lock.phase, .locked)
        XCTAssertEqual(bridge.webView?.accessibilityElementsHidden, true)
        XCTAssertFalse(c.overlay.view.isDescendant(of: try XCTUnwrap(bridge.webView)))
        bridge.webView?.stopLoading()
    }
    func testControllerAllowsOnlyOneAutoPromptAndManualRetry() throws {
        let c = try controller()
        c.send(.didBecomeActive)
        bio.completions[0](.cancelled)
        c.send(.willResignActive)
        c.send(.didBecomeActive)
        XCTAssertEqual(bio.completions.count, 1)
        c.send(.unlockTapped)
        XCTAssertEqual(bio.completions.count, 2)
    }
    func testConfirmedSignedOutNeverLocks() throws {
        let c = try controller()
        c.send(.authCookieObserved(false))
        c.send(.didEnterBackground)
        c.send(.didBecomeActive)
        XCTAssertEqual(c.lock.phase, .open)
        XCTAssertTrue(bio.completions.isEmpty)
    }
    func testEnrollmentChangeSignsOutWithoutRevealingPage() throws {
        let c = try controller()
        c.send(.didBecomeActive)
        bio.completions[0](.success(Data([2])))
        XCTAssertEqual(c.lock.phase, .signingOut)
        XCTAssertFalse(c.overlay.view.isHidden)
        XCTAssertEqual(reloads, 0)
    }
    func testNilEnrollmentAtOptInStaysOffAndAtUnlockSignsOut() throws {
        settings.enabled = false
        let c = try controller()
        c.send(.didBecomeActive)
        c.message(try XCTUnwrap(FaceIdRequest(body: ["action": "enable", "requestId": "nil-state"])))
        bio.completions[0](.success(nil))
        XCTAssertFalse(settings.enabled)
        settings.enabled = true
        c.send(.didEnterBackground)
        c.send(.didBecomeActive)
        bio.completions[1](.success(nil))
        XCTAssertEqual(c.lock.phase, .signingOut)
        XCTAssertFalse(c.overlay.view.isHidden)
    }
    func testOverlayAlwaysHidesWebAccessibilityAndRestoresItAfterUnlock() throws {
        let c = try controller()
        XCTAssertTrue(web.accessibilityElementsHidden)
        c.send(.didBecomeActive)
        XCTAssertTrue(web.accessibilityElementsHidden)
        bio.completions[0](.success(Data([1])))
        XCTAssertFalse(web.accessibilityElementsHidden)
        c.send(.willResignActive)
        XCTAssertTrue(web.accessibilityElementsHidden)
        c.send(.didBecomeActive)
        XCTAssertFalse(web.accessibilityElementsHidden)
        c.send(.didEnterBackground)
        c.send(.passwordTapped)
        XCTAssertTrue(web.accessibilityElementsHidden)
    }
    func testPasswordFallbackKeepsEnabledAndIgnoresSuccess() throws {
        let c = try controller()
        c.send(.didBecomeActive)
        c.send(.passwordTapped)
        bio.completions[0](.success(Data([1])))
        XCTAssertTrue(settings.enabled)
        XCTAssertEqual(c.lock.phase, .signingOut)
        XCTAssertFalse(c.overlay.view.isHidden)
        XCTAssertTrue(web.accessibilityElementsHidden)
    }
    func testSignOutFailureNeverRevealsPage() throws {
        let c = try controller()
        c.send(.passwordTapped)
        c.send(.signOutFinished(false))
        XCTAssertEqual(c.lock.phase, .locked)
        XCTAssertFalse(c.overlay.view.isHidden)
        XCTAssertTrue(web.accessibilityElementsHidden)
    }
    func testPublicNavigationWithAuthCookieStillLocks() throws {
        settings.enabled = false
        let c = try controller()
        c.send(.didBecomeActive)
        settings.enabled = true
        for path in ["/", "/login", "/public"] {
            c.mainFrameCommitted(try XCTUnwrap(URL(string: "https://domusbase.com" + path)))
            XCTAssertTrue(settings.signedIn)
        }
        c.send(.didEnterBackground)
        XCTAssertEqual(c.lock.phase, .locked)
    }
    func testFailedLoginNavigationStaysCoveredAcrossBackgroundAfterCookiesDisappear() throws {
        let c = try controller()
        c.send(.didBecomeActive)
        c.send(.passwordTapped)
        c.send(.authCookieObserved(false))
        c.navigationFailed()
        c.send(.didEnterBackground)
        XCTAssertEqual(c.lock.phase, .locked)
        c.send(.didBecomeActive)
        XCTAssertFalse(c.overlay.view.isHidden)
        XCTAssertTrue(web.accessibilityElementsHidden)
        bio.completions.last?(.success(Data([1])))
        XCTAssertEqual(c.lock.phase, .signingOut)
        XCTAssertFalse(c.overlay.view.isHidden)
    }
    func testSignOutDeletesOnlyAuthCookiesAndWaitsBeforeLoadingLogin() async throws {
        let store = FakeCookies()
        store.deferDeletes = true
        store.cookies = try [FakeCookies.cookie(), FakeCookies.cookie("sb-test-auth-token.0", domain: ".domusbase.com"),
                             FakeCookies.cookie("theme"), FakeCookies.cookie(domain: "other.example")]
        var loaded: URL?
        var result: Bool?
        let loading = expectation(description: "login loaded")
        let cookies = AuthCookies(store: store, load: { loaded = $0; loading.fulfill() }, schedule: { _, _ in })
        cookies.signOut { result = $0 }
        XCTAssertNil(loaded)
        XCTAssertNil(result)
        XCTAssertEqual(store.deleted.sorted(), ["sb-test-auth-token", "sb-test-auth-token.0"])
        store.pendingDeletes[0]()
        XCTAssertNil(loaded)
        store.pendingDeletes[1]()
        await fulfillment(of: [loading], timeout: 2)
        XCTAssertEqual(loaded?.absoluteString, "https://domusbase.com/login")
        XCTAssertNil(result)
        cookies.committed(try XCTUnwrap(loaded))
        XCTAssertEqual(result, true)
        XCTAssertEqual(store.cookies.count, 2)
    }
    func testDeletionFailureAndNavigationFailureAndTimeoutFailClosed() async throws {
        let store = FakeCookies()
        store.cookies = [try FakeCookies.cookie()]
        store.failDeletion = true
        let failed = expectation(description: "deletion failed")
        let cookies = AuthCookies(store: store, load: { _ in XCTFail("Must not navigate") }, schedule: { _, _ in })
        cookies.signOut { XCTAssertFalse($0); failed.fulfill() }
        await fulfillment(of: [failed], timeout: 2)
        for navigationError in [true, false] {
            var timeout: (() -> Void)?
            var result: Bool?
            let cookies = AuthCookies(store: FakeCookies(), load: { _ in }, schedule: { delay, work in
                XCTAssertEqual(delay, 10)
                timeout = work
            })
            cookies.signOut { result = $0 }
            if navigationError { cookies.navigationFailed() } else { timeout?() }
            XCTAssertEqual(result, false)
        }
    }
    func testCookieMatcherRejectsLookalikesAndMalformedChunks() throws {
        for name in ["sb-test-auth-token", "sb-a123-auth-token.0", "sb-a-auth-token.12"] {
            XCTAssertTrue(AuthCookies.matches(try FakeCookies.cookie(name)))
        }
        for name in ["sb-test-auth-token.bad", "prefix-sb-test-auth-token", "sb-A-auth-token", "sb-test-auth-token."] {
            XCTAssertFalse(AuthCookies.matches(try FakeCookies.cookie(name)))
        }
        XCTAssertFalse(AuthCookies.matches(try FakeCookies.cookie(domain: "www.domusbase.com")))
    }
    func testFaceIDUsageDescriptionIsExact() {
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "NSFaceIDUsageDescription") as? String,
                       "Use Face ID to open Domus and keep your info safe.")
    }
    func testBiometricAdapterMapsLAErrors() {
        for code in [LAError.userCancel, .appCancel, .systemCancel] {
            guard case .cancelled = BiometricAuth.failure(LAError(code)) else { return XCTFail("Expected cancelled") }
        }
        guard case .lockout = BiometricAuth.failure(LAError(.biometryLockout)),
              case .notAvailable = BiometricAuth.failure(LAError(.biometryNotAvailable)),
              case .notEnrolled = BiometricAuth.failure(LAError(.biometryNotEnrolled)),
              case .failed = BiometricAuth.failure(LAError(.authenticationFailed)) else { return XCTFail("Wrong mapping") }
    }
}
