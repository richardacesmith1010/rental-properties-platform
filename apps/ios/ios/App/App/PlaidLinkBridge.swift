import UIKit
import WebKit
import LinkKit
import CryptoKit
import os.log

@MainActor
protocol BankLinkSession: AnyObject { func open(from controller: UIViewController) }
@MainActor
protocol BankLinkSessionFactory {
    func create(token: String, success: @escaping (String, [String]) -> Void,
                exit: @escaping (Bool) -> Void) throws -> BankLinkSession
}
extension PlaidLinkSession: BankLinkSession {
    func open(from controller: UIViewController) { open(using: .viewController(controller)) }
}
struct LinkKitSessionFactory: BankLinkSessionFactory {
    func create(token: String, success: @escaping (String, [String]) -> Void,
                exit: @escaping (Bool) -> Void) throws -> BankLinkSession {
        let configuration = LinkTokenConfiguration(token: token, onSuccess: {
            success($0.publicToken, $0.metadata.accounts.map(\.id))
        }, onExit: { exit($0.error != nil) }, onEvent: {
            os_log("%{public}@", String(describing: $0.eventName))
        }, onLoad: nil)
        return try Plaid.createPlaidLinkSession(configuration: configuration)
    }
}

struct PlaidLinkRequest {
    let requestId: String
    let linkToken: String
    init?(body: Any) {
        guard let body = body as? [String: Any], body["action"] as? String == "open",
              let id = body["requestId"] as? String, id.utf16.count <= 64,
              let token = body["linkToken"] as? String, token.hasPrefix("link-"), token.utf16.count <= 200 else { return nil }
        requestId = id
        linkToken = token
    }
    static func reply(requestId: String, status: String, publicToken: String? = nil, accountIds: [String] = []) -> String? {
        var body: [String: Any] = ["requestId": requestId, "status": status]
        if status == "success", let publicToken { body["publicToken"] = publicToken; body["accountIds"] = accountIds }
        guard let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return "window.dispatchEvent(new CustomEvent('domus-plaid-link',{detail:" + json + "}))"
    }
}

@MainActor
final class PlaidLinkBridge {
    private weak var presenter: UIViewController?
    private let factory: BankLinkSessionFactory
    private let cookies: AuthCookieStoring
    private let document: () -> UUID
    private let signingOut: () -> Bool
    private let currentURL: () -> URL?
    private let evaluate: (String) -> Void
    private let log: (String) -> Void
    private(set) var session: BankLinkSession?
    private var attempt: UUID?
    var isActive: Bool { attempt != nil }

    init(presenter: UIViewController, cookies: AuthCookieStoring, document: @escaping () -> UUID,
         signingOut: @escaping () -> Bool, currentURL: @escaping () -> URL?, evaluate: @escaping (String) -> Void,
         factory: BankLinkSessionFactory? = nil, log: @escaping (String) -> Void = { os_log("%{public}@", $0) }) {
        self.presenter = presenter
        self.cookies = cookies
        self.document = document
        self.signingOut = signingOut
        self.currentURL = currentURL
        self.evaluate = evaluate
        self.factory = factory ?? LinkKitSessionFactory()
        self.log = log
    }

    static func authSnapshot(_ cookies: [HTTPCookie]) -> Set<Data> {
        Set(cookies.filter(AuthCookies.matches).map { Data(SHA256.hash(data: Data($0.value.utf8))) })
    }

    func open(_ request: PlaidLinkRequest) {
        guard MessageProvenance.trustedURL(currentURL()), !signingOut() else { return }
        guard !isActive else {
            deliver(request.requestId, status: "error")
            return
        }
        let id = UUID(), origin = document()
        attempt = id
        cookies.getAllCookies { [weak self] values in
            guard let self, self.attempt == id else { return }
            let auth = Self.authSnapshot(values)
            guard self.document() == origin, !self.signingOut(),
                  MessageProvenance.trustedURL(self.currentURL()), let presenter = self.presenter else {
                self.release(id, dropped: true); return
            }
            do {
                let created = try self.factory.create(token: request.linkToken, success: { [weak self] token, accounts in
                    self?.finish(id, requestId: request.requestId, origin: origin, auth: auth,
                                 status: "success", token: token, accounts: accounts)
                }, exit: { [weak self] error in
                    self?.finish(id, requestId: request.requestId, origin: origin, auth: auth, status: error ? "error" : "exit")
                })
                guard self.attempt == id else { return }
                self.session = created
                created.open(from: presenter)
            } catch {
                self.finish(id, requestId: request.requestId, origin: origin, auth: auth, status: "error")
            }
        }
    }

    private func finish(_ id: UUID, requestId: String, origin: UUID, auth: Set<Data>, status: String,
                        token: String? = nil, accounts: [String] = []) {
        guard attempt == id else { return }
        cookies.getAllCookies { [weak self] values in
            guard let self, self.attempt == id else { return }
            let stale = self.document() != origin || Self.authSnapshot(values) != auth || self.signingOut()
                || !MessageProvenance.trustedURL(self.currentURL())
            self.release(id, dropped: stale)
            if !stale { self.deliver(requestId, status: status, token: token, accounts: accounts) }
        }
    }
    private func release(_ id: UUID, dropped: Bool) {
        guard attempt == id else { return }
        session = nil
        attempt = nil
        if dropped { log("plaid_link_reply_dropped") }
    }
    private func deliver(_ requestId: String, status: String, token: String? = nil, accounts: [String] = []) {
        guard MessageProvenance.trustedURL(currentURL()),
              let script = PlaidLinkRequest.reply(requestId: requestId, status: status, publicToken: token,
                                                  accountIds: accounts) else { return }
        evaluate(script)
    }
}
