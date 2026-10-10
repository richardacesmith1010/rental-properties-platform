import XCTest
import WebKit
@testable import App

@MainActor
final class DownloadHandlerTests: XCTestCase {
    private func response(_ headers: [String: String]) -> HTTPURLResponse {
        HTTPURLResponse(url: URL(string: "https://domusbase.com/api/export")!,
                        statusCode: 200, httpVersion: nil, headerFields: headers)!
    }

    func testFilenameComesFromContentDisposition() {
        let result = response(["Content-Disposition": "attachment; filename=\"owner-statement.pdf\""])
        XCTAssertEqual(DownloadHandler.filename(response: result, suggested: "export"), "owner-statement.pdf")
    }

    func testEncodedFilenameAndTraversalAreHandled() {
        let result = response(["Content-Disposition": "attachment; filename=old.csv; filename*=UTF-8''October%20rent.csv"])
        XCTAssertEqual(DownloadHandler.filename(response: result, suggested: "export"), "October rent.csv")
        XCTAssertEqual(DownloadHandler.safeFilename("../../owner.csv"), "owner.csv")
        XCTAssertEqual(DownloadHandler.safeFilename("..\\owner.csv"), "owner.csv")
    }

    func testMimeTypesAndAttachmentDetection() {
        for mime in ["application/pdf", "text/csv", "text/csv; charset=utf-8"] {
            XCTAssertTrue(DownloadHandler.isDownload(response(["Content-Type": mime])))
        }
        XCTAssertTrue(DownloadHandler.isDownload(response(["Content-Disposition": "attachment; filename=data.json"])))
        XCTAssertFalse(DownloadHandler.isDownload(response(["Content-Type": "text/html"])))
        XCTAssertFalse(DownloadHandler.isDownload(response(["Content-Disposition": "inline", "Content-Type": "text/html"])))
    }

    func testCsvSharingAndCancellationCleanUpTheTemporaryFile() throws {
        let presenter = PresenterSpy()
        let handler = DownloadHandler(presenter: presenter)
        handler.shareCsv(filename: "../rent.csv", csv: "Month,Amount\nOctober,500")
        let file = try XCTUnwrap(presenter.file)
        XCTAssertEqual(file.lastPathComponent, "rent.csv")
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "Month,Amount\nOctober,500")
        // The same completion runs for share completion and cancellation.
        presenter.completion?()
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        XCTAssertEqual(presenter.failures, 0)
    }

    func testWriteFailureShowsNativeErrorWithoutPresentingAShareSheet() throws {
        let blockedDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data().write(to: blockedDirectory)
        defer { try? FileManager.default.removeItem(at: blockedDirectory) }
        let presenter = PresenterSpy()
        let handler = DownloadHandler(presenter: presenter, temporaryDirectory: blockedDirectory)
        handler.shareCsv(filename: "rent.csv", csv: "a,b")
        XCTAssertEqual(presenter.failures, 1)
        XCTAssertNil(presenter.file)
    }

    func testControlCharactersCannotEscapeTheTemporaryDirectory() {
        let presenter = PresenterSpy()
        let handler = DownloadHandler(presenter: presenter)
        // A NUL is stripped by the sanitizer, so even a hostile filename remains safe.
        handler.shareCsv(filename: "\u{0}", csv: "a,b")
        XCTAssertEqual(presenter.file?.lastPathComponent, "Domus-download")
        presenter.completion?()
    }
}

@MainActor
private final class PresenterSpy: DownloadPresenting {
    var file: URL?
    var completion: (() -> Void)?
    var failures = 0

    func share(file: URL, completion: @escaping () -> Void) {
        self.file = file
        self.completion = completion
    }

    func showDownloadFailure() { failures += 1 }
}
