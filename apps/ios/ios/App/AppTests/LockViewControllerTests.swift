import XCTest
import UIKit
import WebKit
@testable import App

@MainActor
final class LockViewControllerTests: XCTestCase {
    func testPaletteResolvesToGraphiteHexValues() {
        let palette: [(UIColor, Int, Int)] = [
            (LockViewController.action, 0x0B0C0E, 0xF2F3F5),
            (LockViewController.actionText, 0xFFFFFF, 0x0B0C0E),
            (LockViewController.ground, 0xF3F4F6, 0x0E0F11),
            (LockViewController.ink, 0x0B0C0E, 0xF2F3F5),
            (LockViewController.link, 0x2442B8, 0x8DA2F0)
        ]
        for (token, light, dark) in palette {
            for (style, hex) in [(UIUserInterfaceStyle.light, light), (.dark, dark)] {
                assertHex(token, style: style, hex: hex)
            }
        }
    }

    func testLockScreenUsesGraphiteStyling() throws {
        let controller = LockViewController()
        controller.loadViewIfNeeded()
        controller.display(cover: false, busy: false, kind: .faceId)
        let views = descendants(of: controller.view)
        let buttons = views.compactMap { $0 as? UIButton }
        let primary = try XCTUnwrap(buttons.first { $0.title(for: .normal) == "Open with Face ID" })
        let fallback = try XCTUnwrap(buttons.first { $0.title(for: .normal) == "Sign in with password" })
        let title = try XCTUnwrap(views.compactMap { $0 as? UILabel }.first { $0.text == "Domus is locked" })
        let primaryStyle = try XCTUnwrap(primary.configuration)
        let fallbackStyle = try XCTUnwrap(fallback.configuration)
        XCTAssertEqual(primaryStyle.cornerStyle, .fixed)
        XCTAssertEqual(primaryStyle.background.cornerRadius, 4)
        XCTAssertFalse(primary.isHidden)
        XCTAssertFalse(fallback.isHidden)
        XCTAssertTrue(title.adjustsFontForContentSizeCategory)
        XCTAssertTrue(title.font.fontDescriptor.symbolicTraits.contains(.traitBold))
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            XCTAssertEqual(controller.view.backgroundColor?.resolvedColor(with: traits),
                           LockViewController.ground.resolvedColor(with: traits))
            XCTAssertEqual(primaryStyle.baseBackgroundColor?.resolvedColor(with: traits),
                           LockViewController.action.resolvedColor(with: traits))
            XCTAssertEqual(primaryStyle.baseForegroundColor?.resolvedColor(with: traits),
                           LockViewController.actionText.resolvedColor(with: traits))
            XCTAssertEqual(fallbackStyle.baseForegroundColor?.resolvedColor(with: traits),
                           LockViewController.link.resolvedColor(with: traits))
            XCTAssertEqual(title.textColor.resolvedColor(with: traits), LockViewController.ink.resolvedColor(with: traits))
        }
        let base = UIFont.preferredFont(forTextStyle: .title1)
        if let serif = base.fontDescriptor.withDesign(.serif)?.withSymbolicTraits(.traitBold) {
            XCTAssertEqual(title.font.familyName, UIFont(descriptor: serif, size: base.pointSize).familyName)
            XCTAssertEqual(title.font.fontName, UIFont(descriptor: serif, size: base.pointSize).fontName)
        }
    }

    func testTitleFontScalesWithDynamicType() {
        let normal = LockViewController.titleFont(compatibleWith: UITraitCollection(preferredContentSizeCategory: .large))
        let accessible = LockViewController.titleFont(
            compatibleWith: UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge))
        XCTAssertGreaterThan(accessible.pointSize, normal.pointSize)
        XCTAssertTrue(normal.fontDescriptor.symbolicTraits.contains(.traitBold))
        XCTAssertTrue(accessible.fontDescriptor.symbolicTraits.contains(.traitBold))
    }

    func testPresentedOfferUsesInkTint() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let priorKeyWindow = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        let host = UIViewController(), web = WKWebView()
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.loadViewIfNeeded()
        host.view.addSubview(web)
        let settings = FakeLockSettings(), store = FakeCookies()
        settings.enabled = false
        settings.offered = false
        store.cookies = [try FakeCookies.cookie()]
        let controller = AppLockController(host: host, webView: web, settings: settings, biometrics: FakeBiometrics(),
                                           cookies: AuthCookies(store: store, load: { _ in }), reloadConnect: {})
        defer {
            host.dismiss(animated: false)
            controller.lockWindow?.isHidden = true
            controller.lockWindow?.resignKey()
            window.isHidden = true
            window.rootViewController = nil
            priorKeyWindow?.makeKeyAndVisible()
        }
        controller.install(window: window)
        controller.send(.didBecomeActive)
        controller.mainFrameCommitted(try XCTUnwrap(URL(string: "https://domusbase.com/owner")))
        let presented = expectation(description: "offer presentation completed")
        let deadline = Date().addingTimeInterval(3)
        while host.presentedViewController == nil && Date() < deadline {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        let alert = try XCTUnwrap(host.presentedViewController as? UIAlertController)
        if let transition = alert.transitionCoordinator {
            transition.animate(alongsideTransition: nil) { _ in presented.fulfill() }
        } else {
            presented.fulfill()
        }
        await fulfillment(of: [presented], timeout: 3)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            XCTAssertEqual(alert.view.tintColor.resolvedColor(with: traits), LockViewController.ink.resolvedColor(with: traits))
        }
        let dismissed = expectation(description: "offer dismissal completed")
        host.dismiss(animated: false) { dismissed.fulfill() }
        await fulfillment(of: [dismissed], timeout: 3)
    }

    private func descendants(of view: UIView) -> [UIView] {
        view.subviews.flatMap { [$0] + descendants(of: $0) }
    }

    private func assertHex(_ token: UIColor, style: UIUserInterfaceStyle, hex: Int,
                           file: StaticString = #filePath, line: UInt = #line) {
        let color = token.resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha), file: file, line: line)
        XCTAssertEqual(Int((red * 255).rounded()), (hex >> 16) & 255, file: file, line: line)
        XCTAssertEqual(Int((green * 255).rounded()), (hex >> 8) & 255, file: file, line: line)
        XCTAssertEqual(Int((blue * 255).rounded()), hex & 255, file: file, line: line)
        XCTAssertEqual(alpha, 1, file: file, line: line)
    }
}
