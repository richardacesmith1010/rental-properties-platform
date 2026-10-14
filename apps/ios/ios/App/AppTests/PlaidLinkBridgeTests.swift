import XCTest
import WebKit
@testable import App

@MainActor
final class FakeBankSession: BankLinkSession {
    var opens = 0
    func open(from controller: UIViewController) { opens += 1 }
}
@MainActor
final class FakeBankFactory: BankLinkSessionFactory {
    weak var created: FakeBankSession?
    var success: ((String, [String]) -> Void)?
    var exit: ((Bool) -> Void)?
    var creates = 0
    func create(token: String, success: @escaping (String, [String]) -> Void,
                exit: @escaping (Bool) -> Void) throws -> BankLinkSession {
        XCTAssertEqual(token, "link-synthetic")
        self.success = success; self.exit = exit; creates += 1
        let session = FakeBankSession()
        created = session
        return session
    }
}
@MainActor
final class BankBridgeFixture {
    let host = UIViewController()
    let cookies = FakeCookies()
    let factory = FakeBankFactory()
    var document = UUID()
    var signingOut = false
    var url = URL(string: "https://domusbase.com/owner/bank")
    var scripts: [String] = []
    var logs: [String] = []
    lazy var bridge = PlaidLinkBridge(presenter: host, cookies: cookies, document: { [unowned self] in document },
        signingOut: { [unowned self] in signingOut }, currentURL: { [unowned self] in url },
        evaluate: { [unowned self] in scripts.append($0) }, factory: factory, log: { [unowned self] in logs.append($0) })
    func open(_ id: String = "one") throws {
        bridge.open(try XCTUnwrap(PlaidLinkRequest(body: ["action": "open", "requestId": id, "linkToken": "link-synthetic"])))
    }
    func body(_ index: Int = 0) throws -> [String: Any] {
        let script = try XCTUnwrap(scripts.indices.contains(index) ? scripts[index] : nil)
        let prefix = "window.dispatchEvent(new CustomEvent('domus-plaid-link',{detail:"
        XCTAssertTrue(script.hasPrefix(prefix)); XCTAssertTrue(script.hasSuffix("}))"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(script.dropFirst(prefix.count).dropLast(3).utf8))
                            as? [String: Any])
    }
}

@MainActor
final class PlaidLinkBridgeTests: XCTestCase {
    func testBadProvenanceBodiesAndTokensNeverCreateSession() throws {
        let f = BankBridgeFixture(), web = WKWebView()
        let start = try XCTUnwrap(f.url)
        let handler = DomusNavigationDelegate(original: NSObject(),
            downloads: DownloadHandler(presenter: DownloadPresenter(viewController: f.host)),
            offlineURL: nil, startupURL: start, mainWebView: web)
        handler.onPlaidLink = { f.bridge.open($0) }
        let valid: [String: Any] = ["action": "open", "requestId": "one", "linkToken": "link-synthetic"]
        for (main, scheme, host, port, url) in [
            (false, "https", "domusbase.com", 443, start), (true, "http", "domusbase.com", 443, start),
            (true, "https", "evil.example", 443, start), (true, "https", "domusbase.com", 8443, start),
            (true, "https", "domusbase.com", 443, URL(string: "https://evil.example"))
        ] {
            handler.handleMessage(name: "domusPlaidLink", body: valid, mainFrame: main,
                                  scheme: scheme, host: host, port: port, currentURL: url)
        }
        let invalid: [Any] = ["open", [:], ["action": "close", "requestId": "one", "linkToken": "link-synthetic"],
            ["action": "open", "requestId": 1, "linkToken": "link-synthetic"],
            ["action": "open", "requestId": String(repeating: "x", count: 65), "linkToken": "link-synthetic"],
            ["action": "open", "requestId": "one", "linkToken": "public-synthetic"],
            ["action": "open", "requestId": "one", "linkToken": "link-" + String(repeating: "x", count: 196)],
            ["action": "open", "requestId": "one"]]
        for body in invalid {
            handler.handleMessage(name: "domusPlaidLink", body: body, mainFrame: true,
                                  scheme: "https", host: "domusbase.com", port: 443, currentURL: start)
        }
        XCTAssertEqual(f.factory.creates, 0)
        handler.handleMessage(name: "domusPlaidLink", body: valid, mainFrame: true,
                              scheme: "https", host: "domusbase.com", port: 443, currentURL: start)
        XCTAssertEqual(f.factory.creates, 1); XCTAssertEqual(f.factory.created?.opens, 1)
    }
    func testSecondOpenRepliesErrorWithoutReplacingRetainedSession() throws {
        let f = BankBridgeFixture(); try f.open(); let first = f.factory.created
        try f.open("two")
        XCTAssertEqual(f.factory.creates, 1); XCTAssertTrue(f.bridge.session === first)
        XCTAssertEqual(try f.body() as NSDictionary, ["requestId": "two", "status": "error"] as NSDictionary)
    }
    func testSuccessReplyShapeEscapesJSONAndReleasesSessionWithoutLoggingTokens() throws {
        let f = BankBridgeFixture(); let id = "\"});bad();//\n\\"
        try f.open(id); f.factory.success?("public-synthetic", ["account-synthetic"])
        XCTAssertEqual(try f.body() as NSDictionary, ["requestId": id, "status": "success",
            "publicToken": "public-synthetic", "accountIds": ["account-synthetic"]] as NSDictionary)
        XCTAssertFalse(f.bridge.isActive); XCTAssertNil(f.bridge.session); XCTAssertNil(f.factory.created)
        XCTAssertTrue(f.logs.isEmpty)
        f.factory.exit?(false); XCTAssertEqual(f.scripts.count, 1)
    }
    func testExitAndErrorReplyShapesAndRelease() throws {
        for error in [false, true] {
            let f = BankBridgeFixture(); try f.open(); f.factory.exit?(error)
            XCTAssertEqual(try f.body() as NSDictionary, ["requestId": "one", "status": error ? "error" : "exit"] as NSDictionary)
            XCTAssertNil(f.bridge.session); XCTAssertNil(f.factory.created); XCTAssertFalse(f.bridge.isActive)
        }
    }
    func testNavigationCookieChangeSigningOutAndUntrustedURLDropAndRelease() throws {
        for change in ["navigation", "signout", "account", "signingOut", "untrusted"] {
            let f = BankBridgeFixture(); f.cookies.cookies = [try FakeCookies.cookie()]; try f.open()
            switch change {
            case "navigation": f.document = UUID()
            case "signout": f.cookies.cookies = []
            case "account":
                f.cookies.cookies = [try XCTUnwrap(HTTPCookie(properties: [.name: "sb-test-auth-token",
                    .value: "synthetic-other-account", .domain: "domusbase.com", .path: "/"]))]
            case "signingOut": f.signingOut = true
            default: f.url = URL(string: "https://evil.example")
            }
            f.factory.success?("public-synthetic", ["account-synthetic"])
            XCTAssertTrue(f.scripts.isEmpty, change); XCTAssertEqual(f.logs, ["plaid_link_reply_dropped"])
            XCTAssertNil(f.bridge.session); XCTAssertNil(f.factory.created); XCTAssertFalse(f.bridge.isActive)
        }
    }
    func testSameDocumentAndAuthDeliverAndCookieSnapshotHashesOnlyAuthValuesAsASet() throws {
        let f = BankBridgeFixture()
        let auth = try FakeCookies.cookie(), theme = try FakeCookies.cookie("theme")
        f.cookies.cookies = [auth, theme]; try f.open()
        f.cookies.cookies = [auth]; f.factory.exit?(false)
        XCTAssertEqual(try f.body()["status"] as? String, "exit")
        let hash = PlaidLinkBridge.authSnapshot([auth, auth, theme])
        XCTAssertEqual(hash.count, 1); XCTAssertEqual(hash.first?.count, 32)
        XCTAssertFalse(hash.contains(Data(auth.value.utf8)))
    }
}
