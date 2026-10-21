import XCTest
import UIKit

@MainActor
final class LaunchScreenTests: XCTestCase {
    private struct Fixture: Decodable {
        struct Probe: Decodable { let x: CGFloat; let y: CGFloat }
        struct PixelSize: Decodable { let scale: Int; let width: Int; let height: Int }
        let widthPt: CGFloat
        let heightPt: CGFloat
        let aspect: CGFloat
        let probe: Probe
        let pixelSizes: [PixelSize]
    }

    private func fixture() throws -> Fixture {
        let url = try XCTUnwrap(Bundle(for: LaunchScreenTests.self).url(forResource: "LaunchMarkFixture", withExtension: "json"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    private func host(style: UIUserInterfaceStyle) throws -> UIWindow {
        let controller = try XCTUnwrap(UIStoryboard(name: "LaunchScreen", bundle: .main).instantiateInitialViewController())
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.overrideUserInterfaceStyle = style
        window.rootViewController = controller
        window.isHidden = false
        controller.loadViewIfNeeded()
        window.layoutIfNeeded()
        return window
    }

    private func images(in view: UIView) -> [UIImageView] {
        view.subviews.flatMap { child -> [UIImageView] in
            (child as? UIImageView).map { [$0] } ?? images(in: child)
        }
    }

    func testL5LaunchBackgroundResolvesInLightAndDarkWindows() throws {
        for (style, expected) in [(UIUserInterfaceStyle.light, [243, 244, 246]), (.dark, [14, 15, 17])] {
            let window = try host(style: style)
            defer { window.isHidden = true; window.rootViewController = nil }
            let root = try XCTUnwrap(window.rootViewController?.view)
            XCTAssertFalse(root is UIImageView)
            XCTAssertEqual(root.traitCollection.userInterfaceStyle, style)
            let color = try XCTUnwrap(root.backgroundColor).resolvedColor(with: root.traitCollection)
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
            XCTAssertEqual([red, green, blue].map { Int(($0 * 255).rounded()) }, expected)
            XCTAssertEqual(alpha, 1)
            XCTAssertEqual(images(in: root).count, 1)
        }
    }

    func testL5MarkStaysCenteredAndFits320375402PointWindows() throws {
        let fixture = try fixture()
        for style in [UIUserInterfaceStyle.light, .dark] {
            let window = try host(style: style)
            defer { window.isHidden = true; window.rootViewController = nil }
            let root = try XCTUnwrap(window.rootViewController?.view)
            let imageViews = images(in: root)
            XCTAssertEqual(imageViews.count, 1)
            let mark = try XCTUnwrap(imageViews.first)
            XCTAssertEqual(mark.contentMode, .scaleAspectFit)
            for (width, expected): (CGFloat, CGFloat) in [(320, 288), (375, 312), (402, 312)] {
                window.frame = CGRect(x: 0, y: 0, width: width, height: 874)
                root.frame = window.bounds
                root.setNeedsLayout()
                window.layoutIfNeeded()
                root.layoutIfNeeded()
                XCTAssertFalse(root.hasAmbiguousLayout)
                XCTAssertFalse(mark.hasAmbiguousLayout)
                XCTAssertEqual(root.bounds.width, width, accuracy: 0.5)
                XCTAssertEqual(mark.bounds.width, expected, accuracy: 0.5)
                XCTAssertEqual(mark.bounds.width / mark.bounds.height, fixture.aspect, accuracy: 0.001)
                XCTAssertEqual(mark.center.x, root.bounds.midX, accuracy: 1)
                XCTAssertEqual(mark.center.y, root.bounds.midY, accuracy: 1)
                XCTAssertGreaterThanOrEqual(mark.frame.minX, 16)
                XCTAssertGreaterThanOrEqual(root.bounds.width - mark.frame.maxX, 16)
            }
        }
    }

    func testL5L6bSharedOpaqueProbeMatchesLightAndDarkImages() throws {
        let fixture = try fixture()
        for (style, expected) in [(UIUserInterfaceStyle.light, [11, 12, 14]), (.dark, [255, 255, 255])] {
            let window = try host(style: style)
            defer { window.isHidden = true; window.rootViewController = nil }
            let root = try XCTUnwrap(window.rootViewController?.view)
            let image = try XCTUnwrap(images(in: root).first?.image)
            let asset = try XCTUnwrap(image.imageAsset)
            let resolved = asset.image(with: root.traitCollection)
            let size = try XCTUnwrap(fixture.pixelSizes.first { CGFloat($0.scale) == resolved.scale })
            let cgImage = try XCTUnwrap(resolved.cgImage)
            XCTAssertEqual(cgImage.width, size.width)
            XCTAssertEqual(cgImage.height, size.height)
            XCTAssertLessThanOrEqual(cgImage.width * cgImage.height * 4, 4_000_000)
            let x = floor(fixture.probe.x * CGFloat(cgImage.width) / fixture.widthPt)
            let y = floor(fixture.probe.y * CGFloat(cgImage.height) / fixture.heightPt)
            let pixel = try XCTUnwrap(cgImage.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)))
            let rgba = try rgbaBytes(pixel)
            XCTAssertEqual(rgba[3], 255, "The shared baseline probe must be opaque")
            for channel in 0..<3 {
                XCTAssertEqual(Double(rgba[channel]), Double(expected[channel]), accuracy: 8)
            }
        }
    }

    private func rgbaBytes(_ pixel: CGImage) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: 4)
        let colorSpace = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        try bytes.withUnsafeMutableBytes { buffer in
            let info = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: 1, height: 1,
                bitsPerComponent: 8, bytesPerRow: 4, space: colorSpace, bitmapInfo: info))
            context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        return bytes
    }
}
