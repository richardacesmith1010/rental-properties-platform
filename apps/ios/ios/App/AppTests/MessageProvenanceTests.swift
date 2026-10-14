import XCTest
import WebKit
@testable import App

@MainActor
final class MessageProvenanceTests: XCTestCase {
    private func accepts(main: Bool = true, scheme: String = "https", host: String = "domusbase.com",
                         port: Int = 443, current: String = "https://domusbase.com/settings") -> Bool {
        MessageProvenance.accepts(mainFrame: main, scheme: scheme, host: host, port: port, currentURL: URL(string: current))
    }
    func testAcceptsOnlyTrustedMainFrame() { XCTAssertTrue(accepts()); XCTAssertTrue(accepts(port: 0)) }
    func testRejectsTrustedSubframe() { XCTAssertFalse(accepts(main: false)) }
    func testRejectsHTTP() { XCTAssertFalse(accepts(scheme: "http")) }
    func testRejectsWWWAndLookalikeHosts() {
        for host in ["www.domusbase.com", "domusbase.com.evil.example", "evil-domusbase.com"] {
            XCTAssertFalse(accepts(host: host))
        }
    }
    func testRejectsNon443Port() { XCTAssertFalse(accepts(port: 8443)) }
    func testRejectsOffHostCurrentURL() { XCTAssertFalse(accepts(current: "https://other.example/owner")) }
    func testRejectsMalformedBodyUnknownActionAndInvalidCorrelation() {
        for body: Any in ["get", [:], ["action": "delete", "requestId": "1"], ["action": "get"],
                          ["action": "get", "requestId": 123], ["action": "get", "requestId": String(repeating: "x", count: 65)]] {
            XCTAssertNil(FaceIdRequest(body: body))
        }
        for action in ["get", "enable", "disable"] {
            XCTAssertNotNil(FaceIdRequest(body: ["action": action, "requestId": String(repeating: "x", count: 64)]))
        }
    }
    func testReplyBuilderProducesValidJSONForEveryKindAndEscapesRequestID() throws {
        let id = "\"});window.bad=true;//\n\\"
        for kind in BiometricKind.allCases {
            let script = try XCTUnwrap(FaceIdRequest.reply(requestId: id, available: true, enabled: false, kind: kind))
            let prefix = "window.dispatchEvent(new CustomEvent('domus-face-id',{detail:"
            XCTAssertTrue(script.hasPrefix(prefix))
            XCTAssertTrue(script.hasSuffix("}))"))
            let json = String(script.dropFirst(prefix.count).dropLast(3))
            let data = try XCTUnwrap(json.data(using: .utf8))
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            XCTAssertEqual(body["requestId"] as? String, id)
            XCTAssertEqual(body["kind"] as? String, kind.rawValue)
            XCTAssertEqual(body["available"] as? Bool, true)
            XCTAssertEqual(body["enabled"] as? Bool, false)
        }
    }
    func testBothCSVAndFaceIDHandlersUseTheSameProvenanceCheck() throws {
        let presenter = MessagePresenter()
        let web = WKWebView()
        let start = try XCTUnwrap(URL(string: "https://domusbase.com/owner"))
        let handler = DomusNavigationDelegate(original: NSObject(), downloads: DownloadHandler(presenter: presenter),
                                              offlineURL: nil, startupURL: start, mainWebView: web)
        var requests = 0
        handler.onFaceId = { _ in requests += 1 }
        let invalid: [(Bool, String, String, Int, URL?)] = [
            (false, "https", "domusbase.com", 443, start), (true, "http", "domusbase.com", 443, start),
            (true, "https", "www.domusbase.com", 443, start), (true, "https", "domusbase.com.evil", 443, start),
            (true, "https", "domusbase.com", 8443, start),
            (true, "https", "domusbase.com", 443, URL(string: "https://other.example"))
        ]
        for (main, scheme, host, port, current) in invalid {
            handler.handleMessage(name: "domusShareCsv", body: ["filename": "test.csv", "csv": "a,b"],
                                  mainFrame: main, scheme: scheme, host: host, port: port, currentURL: current)
            handler.handleMessage(name: "domusFaceId", body: ["action": "get", "requestId": "test"],
                                  mainFrame: main, scheme: scheme, host: host, port: port, currentURL: current)
        }
        XCTAssertEqual(presenter.shares, 0)
        XCTAssertEqual(requests, 0)
        handler.handleMessage(name: "domusShareCsv", body: ["filename": "test.csv", "csv": "a,b"],
                              mainFrame: true, scheme: "https", host: "domusbase.com", port: 0, currentURL: start)
        handler.handleMessage(name: "domusFaceId", body: ["action": "get", "requestId": "test"],
                              mainFrame: true, scheme: "https", host: "domusbase.com", port: 443, currentURL: start)
        XCTAssertEqual(presenter.shares, 1)
        XCTAssertEqual(requests, 1)
    }
}

@MainActor
private final class MessagePresenter: DownloadPresenting {
    var shares = 0
    func share(file: URL, completion: @escaping () -> Void) { shares += 1; completion() }
    func showDownloadFailure() { XCTFail("Unexpected share failure") }
}
