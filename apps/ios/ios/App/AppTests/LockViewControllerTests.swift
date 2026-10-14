import XCTest
import UIKit
@testable import App

@MainActor
final class LockViewControllerTests: XCTestCase {
    func testDynamicAccentResolvesToWalletHexValues() {
        for (style, hex) in [(UIUserInterfaceStyle.light, 0x0A5BD3), (.dark, 0x4C8DFF)] {
            let color = LockViewController.accent.resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
            XCTAssertEqual(Int((red * 255).rounded()), (hex >> 16) & 255)
            XCTAssertEqual(Int((green * 255).rounded()), (hex >> 8) & 255)
            XCTAssertEqual(Int((blue * 255).rounded()), hex & 255)
            XCTAssertEqual(alpha, 1)
        }
    }
}
