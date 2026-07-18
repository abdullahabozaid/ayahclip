import Foundation
@preconcurrency import WebKit

final class NativeMediaSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "ayahclip-media"

    private let registry: NativeMediaRegistry
    private let lock = NSLock()
    private var cancelledTasks: Set<ObjectIdentifier> = []

    init(registry: NativeMediaRegistry) {
        self.registry = registry
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        let taskID = ObjectIdentifier(urlSchemeTask as AnyObject)
        defer { _ = lock.withLock { cancelledTasks.remove(taskID) } }
        do {
            guard let url = urlSchemeTask.request.url,
                  let handle = NativeMediaRegistry.handle(from: url),
                  let documentURL = urlSchemeTask.request.mainDocumentURL,
                  MobileEditorBridgeContract.allowsNavigation(to: documentURL) else {
                throw URLError(.noPermissionsToReadFile)
            }
            let plan = try registry.responsePlan(
                handle: handle,
                rangeHeader: urlSchemeTask.request.value(forHTTPHeaderField: "Range")
            )
            guard let response = HTTPURLResponse(
                url: url,
                statusCode: plan.statusCode,
                httpVersion: "HTTP/1.1",
                headerFields: plan.headers
            ) else { throw URLError(.badServerResponse) }
            urlSchemeTask.didReceive(response)
            try registry.stream(
                handle: handle,
                plan: plan,
                shouldContinue: { [weak self] in
                    guard let self else { return false }
                    return !self.lock.withLock { self.cancelledTasks.contains(taskID) }
                },
                consume: { data in urlSchemeTask.didReceive(data) }
            )
            guard !lock.withLock({ cancelledTasks.contains(taskID) }) else { return }
            urlSchemeTask.didFinish()
        } catch {
            guard !lock.withLock({ cancelledTasks.contains(taskID) }) else { return }
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        let taskID = ObjectIdentifier(urlSchemeTask as AnyObject)
        _ = lock.withLock { cancelledTasks.insert(taskID) }
    }
}
