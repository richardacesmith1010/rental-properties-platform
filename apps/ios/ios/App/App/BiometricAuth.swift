@preconcurrency import LocalAuthentication

@MainActor
protocol BiometricAuthenticating {
    func availability() -> (kind: BiometricKind, available: Bool)
    func authenticate(reason: String, completion: @escaping (BiometricResult) -> Void)
}

@MainActor
final class BiometricAuth: BiometricAuthenticating {
    func availability() -> (kind: BiometricKind, available: Bool) {
        let context = LAContext()
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        let kind: BiometricKind = context.biometryType == .touchID ? .touchId : context.biometryType == .faceID ? .faceId : .none
        return (kind, available)
    }

    func authenticate(reason: String, completion: @escaping (BiometricResult) -> Void) {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            let result: BiometricResult = success ? .success(context.evaluatedPolicyDomainState) : Self.failure(error)
            DispatchQueue.main.async { completion(result) }
        }
    }

    nonisolated static func failure(_ error: Error?) -> BiometricResult {
        switch (error as? LAError)?.code {
        case .userCancel, .appCancel, .systemCancel: return .cancelled
        case .biometryLockout: return .lockout
        case .biometryNotAvailable: return .notAvailable
        case .biometryNotEnrolled: return .notEnrolled
        default: return .failed
        }
    }
}
