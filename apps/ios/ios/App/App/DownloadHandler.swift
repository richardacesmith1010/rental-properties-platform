import UIKit
import WebKit

@MainActor
protocol DownloadPresenting: AnyObject {
    func share(file: URL, completion: @escaping () -> Void)
    func showDownloadFailure()
}

@MainActor
final class DownloadPresenter: DownloadPresenting {
    weak var viewController: UIViewController?

    init(viewController: UIViewController) {
        self.viewController = viewController
    }

    func share(file: URL, completion: @escaping () -> Void) {
        guard let viewController, viewController.presentedViewController == nil else {
            completion()
            showDownloadFailure()
            return
        }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, _, _, _ in completion() }
        sheet.popoverPresentationController?.sourceView = viewController.view
        viewController.present(sheet, animated: true)
    }

    func showDownloadFailure() {
        guard let viewController else { return }
        let presenter = viewController.presentedViewController ?? viewController
        let alert = UIAlertController(title: "Download failed. Try again.", message: nil, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        presenter.present(alert, animated: true)
    }
}

/// Uses WKDownload, never URLSession: authenticated downloads retain WebKit cookies.
@MainActor
final class DownloadHandler: NSObject, WKDownloadDelegate {
    private let presenter: DownloadPresenting
    private let temporaryDirectory: URL
    private var destinations: [ObjectIdentifier: URL] = [:]
    private var activeDownloads: [ObjectIdentifier: WKDownload] = [:]

    init(presenter: DownloadPresenting, temporaryDirectory: URL = FileManager.default.temporaryDirectory) {
        self.presenter = presenter
        self.temporaryDirectory = temporaryDirectory
    }

    static func isDownload(_ response: URLResponse) -> Bool {
        let disposition = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        let mime = response.mimeType?.lowercased().split(separator: ";").first.map(String.init)
        return disposition.split(separator: ";").first?.trimmingCharacters(in: .whitespaces).lowercased() == "attachment"
            || mime == "application/pdf" || mime == "text/csv"
    }

    static func filename(response: URLResponse, suggested: String) -> String {
        let header = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        // RFC 5987 UTF-8 filename takes precedence over the legacy filename.
        let patterns = [#"(?i)filename\*\s*=\s*UTF-8'[^']*'([^;]+)"#,
                        #"(?i)filename\s*=\s*"([^"]+)""#, #"(?i)filename\s*=\s*([^;]+)"#]
        for (index, pattern) in patterns.enumerated() {
            if let range = header.range(of: pattern, options: .regularExpression),
               let regex = try? NSRegularExpression(pattern: pattern),
               let match = regex.firstMatch(in: String(header[range]), range: NSRange(location: 0, length: String(header[range]).utf16.count)),
               let capture = Range(match.range(at: 1), in: String(header[range])) {
                let value = String(String(header[range])[capture]).trimmingCharacters(in: .whitespaces)
                return safeFilename(index == 0 ? (value.removingPercentEncoding ?? value) : value)
            }
        }
        return safeFilename(suggested)
    }

    static func safeFilename(_ value: String) -> String {
        let name = value.replacingOccurrences(of: "\\", with: "/").components(separatedBy: "/").last ?? ""
        let clean = name.components(separatedBy: .controlCharacters).joined()
        return clean.isEmpty || clean == "." || clean == ".." ? "Domus-download" : String(clean.prefix(180))
    }

    func attach(_ download: WKDownload) {
        activeDownloads[ObjectIdentifier(download)] = download
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        do {
            let destination = try temporaryFile(named: Self.filename(response: response, suggested: suggestedFilename))
            destinations[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        } catch {
            completionHandler(nil)
            fail(download)
        }
    }

    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) {
        // Download redirects must obey the same top-level policy.
        let allowed = NavigationPolicy.decide(url: request.url, isMainFrame: true) == .allowInApp
        decisionHandler(allowed ? .allow : .cancel)
        if !allowed { fail(download) }
    }

    func downloadDidFinish(_ download: WKDownload) {
        let id = ObjectIdentifier(download)
        activeDownloads.removeValue(forKey: id)
        guard let file = destinations.removeValue(forKey: id) else { return }
        share(file)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        fail(download)
    }

    func shareCsv(filename: String, csv: String) {
        var file: URL?
        do {
            let destination = try temporaryFile(named: Self.safeFilename(filename))
            file = destination
            try Data(csv.utf8).write(to: destination, options: .atomic)
            share(destination)
        } catch {
            if let file { remove(file) }
            presenter.showDownloadFailure()
        }
    }

    private func temporaryFile(named name: String) throws -> URL {
        let directory = temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent(name)
    }

    private func share(_ file: URL) {
        presenter.share(file: file) { [weak self] in self?.remove(file) }
    }

    private func fail(_ download: WKDownload) {
        let id = ObjectIdentifier(download)
        guard activeDownloads.removeValue(forKey: id) != nil else { return }
        if let file = destinations.removeValue(forKey: id) { remove(file) }
        presenter.showDownloadFailure()
    }

    private func remove(_ file: URL) {
        do { try FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        catch { NSLog("Domus temporary download cleanup failed: %@", error.localizedDescription) }
    }
}
