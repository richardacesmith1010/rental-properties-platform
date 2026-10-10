import Foundation

/// Top-level policy only. Frames and resources retain normal WebKit behavior.
enum NavigationPolicy {
    enum Decision: Equatable {
        case allowInApp, openExternal, system, reject
    }

    static let hosts: Set<String> = [
        "domusbase.com", "checkout.stripe.com", "hooks.stripe.com", "pay.stripe.com"
    ]

    static func decide(url: URL?, isMainFrame: Bool) -> Decision {
        guard isMainFrame else { return .allowInApp }
        guard let url, url.baseURL == nil,
              let scheme = url.scheme?.lowercased(),
              !url.absoluteString.contains("\\"),
              url.user == nil, url.password == nil else { return .reject }
        if ["mailto", "tel", "sms"].contains(scheme) { return .system }
        guard ["https", "http"].contains(scheme),
              let host = url.host?.lowercased(), !host.isEmpty,
              !host.contains(where: { $0.isWhitespace }), !host.contains("%") else { return .reject }
        if hosts.contains(host) {
            return scheme == "https" ? .allowInApp : .reject
        }
        return .openExternal
    }

    static func isDomusBlob(_ url: URL?) -> Bool {
        guard let url, url.scheme == "blob" else { return false }
        let origin = URL(string: String(url.absoluteString.dropFirst(5)))
        return origin?.scheme == "https" && origin?.host == "domusbase.com"
            && origin?.user == nil && origin?.password == nil
    }

}
