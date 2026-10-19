import XCTest
import UIKit
import WebKit
@testable import App

@MainActor
final class MessageProvenanceTests: XCTestCase {
    func testThemeRequestAcceptsOnlyKnownValues() throws {
        for body: Any in ["dark", [:], ["theme": "sepia"], ["theme": 1], ["theme": "dark", "extra": 1]] {
            XCTAssertNil(ThemeRequest(body: body))
        }
        let styles: [(String, UIUserInterfaceStyle)] = [("light", .light), ("dark", .dark), ("system", .unspecified)]
        for (theme, style) in styles {
            let request = try XCTUnwrap(ThemeRequest(body: ["theme": theme]))
            XCTAssertEqual(request.theme, theme)
            XCTAssertEqual(request.interfaceStyle, style)
        }
    }

    func testThemeMessageIgnoredFromUntrustedOrigin() throws {
        let web = WKWebView()
        let start = try XCTUnwrap(URL(string: "https://domusbase.com/settings"))
        let handler = DomusNavigationDelegate(original: NSObject(), downloads: DownloadHandler(presenter: MessagePresenter()),
                                              offlineURL: nil, startupURL: start, mainWebView: web)
        var themes: [String] = []
        handler.onTheme = { themes.append($0.theme) }
        let invalid: [(Bool, String, String, Int, URL?)] = [
            (false, "https", "domusbase.com", 443, start), (true, "http", "domusbase.com", 443, start),
            (true, "https", "other.example", 443, start), (true, "https", "domusbase.com", 8443, start),
            (true, "https", "domusbase.com", 443, URL(string: "https://other.example"))
        ]
        for (main, scheme, host, port, current) in invalid {
            handler.handleMessage(name: "domusTheme", body: ["theme": "dark"], mainFrame: main,
                                  scheme: scheme, host: host, port: port, currentURL: current)
        }
        XCTAssertTrue(themes.isEmpty)
        handler.handleMessage(name: "domusTheme", body: ["theme": "dark"], mainFrame: true,
                              scheme: "https", host: "domusbase.com", port: 443, currentURL: start)
        XCTAssertEqual(themes, ["dark"])
    }

    private func freshThemeDefaults() throws -> UserDefaults {
        let suite = "MessageProvenanceTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        return defaults
    }

    func testThemeStoreRoundTripAndFallback() throws {
        let defaults = try freshThemeDefaults()
        XCTAssertEqual(ThemeStore.load(defaults: defaults), .unspecified)
        ThemeStore.save("dark", defaults: defaults)
        XCTAssertEqual(ThemeStore.load(defaults: defaults), .dark)
        defaults.set("sepia", forKey: ThemeStore.key)
        XCTAssertEqual(ThemeStore.load(defaults: defaults), .unspecified)
    }

    func testApplyThemeSetsWindowsAndPersists() throws {
        let defaults = try freshThemeDefaults()
        let bridge = DomusBridgeViewController()
        bridge.themeDefaults = defaults
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = scene.coordinateSpace.bounds
        let root = UIViewController()
        window.rootViewController = root
        window.isHidden = false
        bridge.appWindow = window
        defer { window.isHidden = true; window.rootViewController = nil }

        for (theme, style) in [("dark", UIUserInterfaceStyle.dark), ("light", .light), ("system", .unspecified)] {
            bridge.applyTheme(try XCTUnwrap(ThemeRequest(body: ["theme": theme])))
            if #available(iOS 17.0, *) { window.updateTraitsIfNeeded() }
            window.layoutIfNeeded()
            XCTAssertEqual(window.overrideUserInterfaceStyle, style)
            XCTAssertEqual(defaults.string(forKey: ThemeStore.key), theme)
            if style != .unspecified {
                XCTAssertEqual(root.view.traitCollection.userInterfaceStyle, style)
            }
        }
    }

    func testRepeatedThemeRepairsMismatchedLockWindow() throws {
        let bridge = DomusBridgeViewController()
        bridge.themeDefaults = try freshThemeDefaults()
        let window = UIWindow()
        let lockWindow = UIWindow()
        bridge.appWindow = window
        bridge.lockWindowProvider = { lockWindow }
        let dark = try XCTUnwrap(ThemeRequest(body: ["theme": "dark"]))
        bridge.applyTheme(dark)
        XCTAssertEqual(window.overrideUserInterfaceStyle, .dark)
        XCTAssertEqual(lockWindow.overrideUserInterfaceStyle, .dark)
        lockWindow.overrideUserInterfaceStyle = .light
        bridge.applyTheme(dark)
        XCTAssertEqual(lockWindow.overrideUserInterfaceStyle, .dark)
        XCTAssertEqual(bridge.themeDefaults.string(forKey: ThemeStore.key), "dark")
    }

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
