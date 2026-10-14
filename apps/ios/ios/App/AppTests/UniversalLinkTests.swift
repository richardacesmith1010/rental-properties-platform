import XCTest
import WebKit
import Capacitor
@testable import App

@MainActor
final class UniversalLinkTests: XCTestCase {
    private func activity(_ value: String = "https://domusbase.com/owner/bank/oauth-app") throws -> NSUserActivity {
        let activity = NSUserActivity(activityType: NSUserActivityTypeBrowsingWeb)
        activity.webpageURL = try XCTUnwrap(URL(string: value))
        return activity
    }
    func testMatchesOnlyExactHTTPSHostAndAppPath() throws {
        XCTAssertTrue(SceneDelegate.isPlaidReturn(try activity()))
        XCTAssertTrue(SceneDelegate.isPlaidReturn(try activity("https://domusbase.com/owner/bank/oauth-app?oauth_state_id=test")))
        for value in ["http://domusbase.com/owner/bank/oauth-app", "https://other.example/owner/bank/oauth-app",
            "https://domusbase.com/owner/bank/oauth", "https://domusbase.com/owner/bank/oauth-app/extra",
            "https://domusbase.com/owner/bank/oauth-app/", "https://domusbase.com:8443/owner/bank/oauth-app",
            "https://user@domusbase.com/owner/bank/oauth-app"] {
            XCTAssertFalse(SceneDelegate.isPlaidReturn(try activity(value)), value)
        }
        XCTAssertFalse(SceneDelegate.isPlaidReturn(NSUserActivity(activityType: "other")))
    }
    func testActiveLinkKit722HasNoContinuationCallRetainsSessionAndSuppressesProxyAndNavigation() throws {
        let f = BankBridgeFixture(); try f.open(); let session = f.factory.created
        SceneDelegate.route(try activity(), active: f.bridge.isActive,
                            load: { _ in XCTFail("Active session must not navigate") },
                            forward: { XCTFail("Active return must not reach Capacitor") })
        XCTAssertTrue(f.bridge.session === session); XCTAssertEqual(session?.opens, 1)
        XCTAssertEqual(f.factory.creates, 1); XCTAssertTrue(f.scripts.isEmpty)
        // BankLinkSession deliberately has no pretend continuation API: LinkKit 7.2.2 has none.
    }
    func testNoSessionLoadsBanksAndForwardsToProxy() throws {
        var urls: [URL] = [], forwards = 0
        SceneDelegate.route(try activity(), active: false, load: { urls.append($0) }, forward: { forwards += 1 })
        XCTAssertEqual(urls.map(\.absoluteString), ["https://domusbase.com/owner/bank"])
        XCTAssertEqual(forwards, 1)
    }
    func testUnrelatedActivityForwardsEvenWhenPlaidIsActive() throws {
        var forwards = 0
        SceneDelegate.route(try activity("https://domusbase.com/owner/bank/oauth"), active: true,
                            load: { _ in XCTFail("Browser OAuth must not navigate the app") }, forward: { forwards += 1 })
        XCTAssertEqual(forwards, 1)
    }
    func testColdStartActivitiesAfterProcessDeathLoadBanksWithoutResuming() throws {
        let f = BankBridgeFixture(), spy = UniversalLinkWebView()
        let activities: Set<NSUserActivity> = [try activity()]
        SceneDelegate.routeColdStart(activities, active: f.bridge.isActive,
                                     load: { spy.loadMainRequest(URLRequest(url: $0)) })
        XCTAssertFalse(f.bridge.isActive); XCTAssertNil(f.bridge.session)
        XCTAssertEqual(f.factory.creates, 0)
        XCTAssertEqual(spy.loaded?.absoluteString, "https://domusbase.com/owner/bank")
    }
    func testEntitlementsAndBothBuildConfigurationsReferenceAssociatedDomains() throws {
        let project = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: project.appendingPathComponent("App/App.entitlements"))
        let plist = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        XCTAssertEqual(plist["com.apple.developer.associated-domains"] as? [String], ["applinks:domusbase.com"])
        let configURL = project.appendingPathComponent("App.xcodeproj/project.pbxproj")
        let config = try String(contentsOf: configURL, encoding: .utf8)
        XCTAssertEqual(config.components(separatedBy: "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;").count - 1, 2)
        let projectPlist = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: configURL),
            format: nil) as? [String: Any])
        let objects = try XCTUnwrap(projectPlist["objects"] as? [String: [String: Any]])
        let group = try XCTUnwrap(objects["504EC3061FED79650016851F"])
        let children = try XCTUnwrap(group["children"] as? [String])
        for file in ["App.entitlements", "PlaidLinkBridge.swift"] {
            XCTAssertTrue(children.contains { objects[$0]?["path"] as? String == file })
        }
        let package = try XCTUnwrap(objects["229000000000000000000003"])
        let requirement = try XCTUnwrap(package["requirement"] as? [String: String])
        XCTAssertEqual(requirement, ["kind": "upToNextMajorVersion", "minimumVersion": "7.2.2"])
    }
}

@MainActor
private final class UniversalLinkWebView: MainWebViewLoading {
    var loaded: URL?
    var mainURL: URL? { loaded }
    func loadMainRequest(_ request: URLRequest) { loaded = request.url }
    func reloadMainView() { XCTFail("Unexpected reload") }
}
