import XCTest
@testable import App

final class FakeLockSettings: LockSettingsStoring {
    var enabled = true
    var offered = true
    var signedIn = true
    var enrollmentState: Data? = Data([1])
}

final class AppLockTests: XCTestCase {
    private let id = UUID()
    private func locked() -> AppLock {
        var lock = AppLock(settings: FakeLockSettings())
        _ = lock.send(.coldLaunch, attempt: id)
        return lock
    }
    func testColdLaunchLocksEnabledSignedIn() {
        var lock = locked()
        XCTAssertEqual(lock.send(.coldLaunch, attempt: id), [.showLockView])
        XCTAssertEqual(lock.phase, .locked)
    }
    func testWillResignActiveCoversOnlyOpen() {
        var lock = AppLock(settings: FakeLockSettings())
        XCTAssertEqual(lock.send(.willResignActive, attempt: id), [.showCover])
        XCTAssertEqual(lock.phase, .covered)
        XCTAssertTrue(lock.send(.willResignActive, attempt: id).isEmpty)
        lock = locked()
        XCTAssertTrue(lock.send(.willResignActive, attempt: id).isEmpty)
    }
    func testDidEnterBackgroundLocksSynchronously() {
        var lock = AppLock(settings: FakeLockSettings())
        XCTAssertEqual(lock.send(.didEnterBackground, attempt: id), [.showLockView])
        XCTAssertEqual(lock.phase, .locked)
        XCTAssertFalse(lock.autoPromptUsed)
    }
    func testDidBecomeActiveUncoversOnlyPrivacyCover() {
        var lock = AppLock(settings: FakeLockSettings())
        _ = lock.send(.willResignActive, attempt: id)
        XCTAssertEqual(lock.send(.didBecomeActive, attempt: id), [.hideOverlay, .runPendingConnectReload])
        XCTAssertEqual(lock.phase, .open)
    }
    func testOnlyOneAutomaticPromptAndUnlockTappedRetries() {
        var lock = locked()
        XCTAssertEqual(lock.send(.didBecomeActive, attempt: id), [.startBiometric(id)])
        XCTAssertTrue(lock.send(.didBecomeActive, attempt: UUID()).isEmpty)
        _ = lock.send(.biometricResult(id, .cancelled), attempt: UUID())
        XCTAssertTrue(lock.send(.didBecomeActive, attempt: UUID()).isEmpty)
        let retry = UUID()
        XCTAssertEqual(lock.send(.unlockTapped, attempt: retry), [.startBiometric(retry)])
    }
    func testBiometricResultSuccessUnlocksAndReloads() {
        var lock = locked()
        _ = lock.send(.didBecomeActive, attempt: id)
        XCTAssertEqual(lock.send(.biometricResult(id, .success(Data([1]))), attempt: UUID()),
                       [.hideOverlay, .runPendingConnectReload])
        XCTAssertEqual(lock.phase, .open)
    }
    func testStaleSuccessAfterBackgroundIsIgnored() {
        var lock = locked()
        _ = lock.send(.didBecomeActive, attempt: id)
        _ = lock.send(.didEnterBackground, attempt: UUID())
        XCTAssertTrue(lock.send(.biometricResult(id, .success(Data([1]))), attempt: UUID()).isEmpty)
        XCTAssertEqual(lock.phase, .locked)
    }
    func testPasswordTappedKeepsEnabledAndIgnoresBiometricSuccess() {
        var lock = locked()
        _ = lock.send(.didBecomeActive, attempt: id)
        XCTAssertEqual(lock.send(.passwordTapped, attempt: UUID()), [.signOutToLogin])
        XCTAssertEqual(lock.phase, .signingOut)
        XCTAssertTrue(lock.settings.enabled)
        XCTAssertTrue(lock.send(.biometricResult(id, .success(Data([1]))), attempt: UUID()).isEmpty)
        _ = lock.send(.didEnterBackground, attempt: UUID())
        XCTAssertEqual(lock.phase, .signingOut)
    }
    func testSignOutFinishedSuccessOpensAndFailureStaysLocked() {
        for ok in [false, true] {
            var lock = locked()
            _ = lock.send(.passwordTapped, attempt: id)
            let effects = lock.send(.signOutFinished(ok), attempt: id)
            XCTAssertEqual(lock.phase, ok ? .open : .locked)
            XCTAssertEqual(effects.contains(.hideOverlay), ok)
            XCTAssertTrue(lock.settings.enabled)
            XCTAssertEqual(lock.settings.signedIn, !ok)
        }
        var lock = locked()
        XCTAssertTrue(lock.send(.signOutFinished(true), attempt: id).isEmpty)
    }
    func testAuthCookieObservedIsOnlySignInAuthority() {
        var lock = locked()
        _ = lock.send(.authCookieObserved(false), attempt: id)
        XCTAssertFalse(lock.settings.signedIn)
        _ = lock.send(.authCookieObserved(true), attempt: id)
        XCTAssertTrue(lock.settings.signedIn)
    }
    func testFailedSignOutCannotBeBypassedByBackgroundOrBiometricsAfterCookiesDisappear() {
        var lock = locked()
        _ = lock.send(.passwordTapped, attempt: id)
        _ = lock.send(.authCookieObserved(false), attempt: id)
        _ = lock.send(.signOutFinished(false), attempt: id)
        XCTAssertEqual(lock.send(.didEnterBackground, attempt: id), [.showLockView])
        XCTAssertEqual(lock.phase, .locked)
        _ = lock.send(.didBecomeActive, attempt: id)
        XCTAssertEqual(lock.send(.biometricResult(id, .success(Data([1]))), attempt: id), [.signOutToLogin])
        XCTAssertEqual(lock.phase, .signingOut)
        _ = lock.send(.signOutFinished(true), attempt: id)
        _ = lock.send(.didEnterBackground, attempt: id)
        XCTAssertEqual(lock.phase, .covered)
    }
    func testEnableConfirmedRequiresDomainState() {
        let settings = FakeLockSettings()
        settings.enabled = false
        settings.offered = false
        settings.enrollmentState = nil
        var lock = AppLock(settings: settings)
        XCTAssertTrue(lock.send(.enableConfirmed(nil), attempt: id).isEmpty)
        XCTAssertFalse(settings.enabled)
        _ = lock.send(.enableConfirmed(Data([2])), attempt: id)
        XCTAssertTrue(settings.enabled)
        XCTAssertTrue(settings.offered)
        XCTAssertEqual(settings.enrollmentState, Data([2]))
    }
    func testDisableRequestedClearsEnrollment() {
        var lock = locked()
        _ = lock.send(.disableRequested, attempt: id)
        XCTAssertFalse(lock.settings.enabled)
        XCTAssertNil(lock.settings.enrollmentState)
    }
    func testEnrollmentMismatchOrNilFailsClosed() {
        for state in [nil, Data([2])] as [Data?] {
            var lock = locked()
            _ = lock.send(.didBecomeActive, attempt: id)
            XCTAssertEqual(lock.send(.biometricResult(id, .success(state)), attempt: id), [.signOutToLogin])
            XCTAssertEqual(lock.phase, .signingOut)
        }
        var lock = locked()
        lock.settings.enrollmentState = nil
        _ = lock.send(.didBecomeActive, attempt: id)
        XCTAssertEqual(lock.send(.biometricResult(id, .success(Data([1]))), attempt: id), [.signOutToLogin])
    }
    func testCancelAndFailureNeverSignOut() {
        for result in [BiometricResult.cancelled, .failed] {
            var lock = locked()
            _ = lock.send(.didBecomeActive, attempt: id)
            XCTAssertEqual(lock.send(.biometricResult(id, result), attempt: id), [.showMessage(nil)])
            XCTAssertEqual(lock.phase, .locked)
        }
    }
    func testUnavailableBiometricsShowsExactCopyForBothKinds() {
        for kind in [BiometricKind.faceId, .touchId] {
            for result in [BiometricResult.lockout, .notAvailable, .notEnrolled] {
                var lock = locked()
                lock.kind = kind
                _ = lock.send(.didBecomeActive, attempt: id)
                XCTAssertEqual(lock.send(.biometricResult(id, result), attempt: id),
                               [.showMessage("\(kind.title) is locked. Sign in with your password.")])
            }
        }
    }
    func testEnabledButSignedOutNeverLocks() {
        let settings = FakeLockSettings()
        settings.signedIn = false
        var lock = AppLock(settings: settings)
        XCTAssertTrue(lock.send(.coldLaunch, attempt: id).isEmpty)
        XCTAssertEqual(lock.phase, .open)
        _ = lock.send(.didEnterBackground, attempt: id)
        XCTAssertEqual(lock.phase, .covered)
        XCTAssertFalse(lock.send(.didBecomeActive, attempt: id).contains(.startBiometric(id)))
    }
    func testNotNowMarksOfferAnswered() {
        var lock = locked()
        lock.settings.offered = false
        _ = lock.send(.offerAnswered, attempt: id)
        XCTAssertTrue(lock.settings.offered)
    }
    func testOfferAcceptsEachSignedInPath() throws {
        for path in ["/owner", "/manager/leases", "/tenant", "/settings/security"] {
            let url = try XCTUnwrap(URL(string: "https://domusbase.com" + path))
            XCTAssertTrue(shouldOfferFaceId(offered: false, biometricsAvailable: true, url: url))
        }
    }
    func testOfferRejectsOffered() throws {
        let url = try XCTUnwrap(URL(string: "https://domusbase.com/owner"))
        XCTAssertFalse(shouldOfferFaceId(offered: true, biometricsAvailable: true, url: url))
    }
    func testOfferRejectsUnavailableBiometrics() throws {
        let url = try XCTUnwrap(URL(string: "https://domusbase.com/owner"))
        XCTAssertFalse(shouldOfferFaceId(offered: false, biometricsAvailable: false, url: url))
    }
    func testOfferRejectsSignedOutPaths() throws {
        for path in ["/", "/login", "/public"] {
            let url = try XCTUnwrap(URL(string: "https://domusbase.com" + path))
            XCTAssertFalse(shouldOfferFaceId(offered: false, biometricsAvailable: true, url: url))
        }
    }
    func testOfferRejectsWrongHost() throws {
        let url = try XCTUnwrap(URL(string: "https://www.domusbase.com/owner"))
        XCTAssertFalse(shouldOfferFaceId(offered: false, biometricsAvailable: true, url: url))
    }
    func testOfferRejectsHTTP() throws {
        let url = try XCTUnwrap(URL(string: "http://domusbase.com/owner"))
        XCTAssertFalse(shouldOfferFaceId(offered: false, biometricsAvailable: true, url: url))
    }
    func testPersistedSettingsAndConservativeUnknownSignIn() throws {
        let suite = "AppLockTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let settings = LockSettings(defaults: defaults)
        XCTAssertTrue(settings.signedIn)
        settings.enabled = true
        settings.offered = true
        settings.signedIn = false
        settings.enrollmentState = Data([3])
        let restored = LockSettings(defaults: defaults)
        XCTAssertTrue(restored.enabled)
        XCTAssertTrue(restored.offered)
        XCTAssertFalse(restored.signedIn)
        XCTAssertEqual(restored.enrollmentState, Data([3]))
    }
}
