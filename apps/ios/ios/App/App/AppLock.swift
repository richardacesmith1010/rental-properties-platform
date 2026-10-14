import Foundation

protocol LockSettingsStoring: AnyObject {
    var enabled: Bool { get set }
    var offered: Bool { get set }
    var signedIn: Bool { get set }
    var enrollmentState: Data? { get set }
}

final class LockSettings: LockSettingsStoring {
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    var enabled: Bool {
        get { defaults.bool(forKey: "domus.faceId.enabled") }
        set { defaults.set(newValue, forKey: "domus.faceId.enabled") }
    }
    var offered: Bool {
        get { defaults.bool(forKey: "domus.faceId.offered") }
        set { defaults.set(newValue, forKey: "domus.faceId.offered") }
    }
    var signedIn: Bool {
        get { defaults.object(forKey: "domus.faceId.signedIn") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "domus.faceId.signedIn") }
    }
    var enrollmentState: Data? {
        get { defaults.data(forKey: "domus.faceId.domainState") }
        set { defaults.set(newValue, forKey: "domus.faceId.domainState") }
    }
}

enum BiometricKind: String, CaseIterable {
    case faceId, touchId, none
    var title: String { self == .touchId ? "Touch ID" : "Face ID" }
}
enum BiometricResult {
    case success(Data?), cancelled, failed, lockout, notAvailable, notEnrolled
}

struct AppLock {
    enum Phase: Equatable { case open, covered, locked, authenticating(attempt: UUID), signingOut }
    enum Effect: Equatable {
        case showCover, showLockView, hideOverlay, startBiometric(UUID), showMessage(String?)
        case signOutToLogin, runPendingConnectReload, saveSettings
    }
    enum Event {
        case coldLaunch, willResignActive, didEnterBackground, willEnterForeground, didBecomeActive, unlockTapped
        case biometricResult(UUID, BiometricResult), passwordTapped, signOutFinished(Bool), authCookieObserved(Bool)
        case enableConfirmed(Data?), disableRequested, offerAnswered
    }
    let settings: LockSettingsStoring
    var kind: BiometricKind = .faceId
    private(set) var phase: Phase = .open
    private(set) var autoPromptUsed = false
    private var requiresLogin = false

    // The supplied attempt makes the reducer deterministic; the controller supplies fresh UUIDs.
    mutating func send(_ event: Event, attempt: UUID) -> [Effect] {
        switch event {
        case .coldLaunch:
            phase = settings.enabled && settings.signedIn ? .locked : .open
            autoPromptUsed = false
            return phase == .locked ? [.showLockView] : []
        case .willResignActive:
            guard phase == .open else { return [] }
            phase = .covered
            return [.showCover]
        case .didEnterBackground:
            guard phase != .signingOut else { return [] }
            autoPromptUsed = false
            phase = requiresLogin || (settings.enabled && settings.signedIn) ? .locked : .covered
            return [phase == .locked ? .showLockView : .showCover]
        case .willEnterForeground: return []
        case .didBecomeActive:
            if phase == .covered {
                phase = .open
                return [.hideOverlay, .runPendingConnectReload]
            }
            guard phase == .locked, !autoPromptUsed else { return [] }
            autoPromptUsed = true
            phase = .authenticating(attempt: attempt)
            return [.startBiometric(attempt)]
        case .unlockTapped:
            guard phase == .locked else { return [] }
            autoPromptUsed = true
            phase = .authenticating(attempt: attempt)
            return [.startBiometric(attempt)]
        case let .biometricResult(id, result):
            guard phase == .authenticating(attempt: id) else { return [] }
            switch result {
            case let .success(state):
                guard !requiresLogin, let state, let saved = settings.enrollmentState, state == saved else {
                    requiresLogin = true
                    phase = .signingOut
                    return [.signOutToLogin]
                }
                phase = .open
                return [.hideOverlay, .runPendingConnectReload]
            case .cancelled, .failed:
                phase = .locked
                return [.showMessage(nil)]
            case .lockout, .notAvailable, .notEnrolled:
                phase = .locked
                return [.showMessage("\(kind.title) is locked. Sign in with your password.")]
            }
        case .passwordTapped:
            guard phase != .signingOut else { return [] }
            requiresLogin = true
            phase = .signingOut
            return [.signOutToLogin]
        case let .signOutFinished(ok):
            guard phase == .signingOut else { return [] }
            if ok {
                requiresLogin = false
                settings.signedIn = false
                phase = .open
                return [.saveSettings, .hideOverlay]
            }
            phase = .locked
            autoPromptUsed = true
            return [.showLockView, .showMessage(nil)]
        case let .authCookieObserved(present):
            settings.signedIn = present
            return [.saveSettings]
        case let .enableConfirmed(state):
            guard let state else { return [] }
            settings.enabled = true
            settings.offered = true
            settings.enrollmentState = state
            return [.saveSettings]
        case .disableRequested:
            settings.enabled = false
            settings.enrollmentState = nil
            return [.saveSettings]
        case .offerAnswered:
            settings.offered = true
            return [.saveSettings]
        }
    }
}

func shouldOfferFaceId(offered: Bool, biometricsAvailable: Bool, url: URL) -> Bool {
    !offered && biometricsAvailable && url.scheme == "https" && url.host == "domusbase.com"
        && ["/owner", "/manager", "/tenant", "/settings"].contains(where: { url.path.hasPrefix($0) })
}
