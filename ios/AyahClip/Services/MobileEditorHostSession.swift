import WebKit

/// Owns every stateful dependency required by one visible shared-editor host.
/// The approved SwiftUI surface may create the view and present system pickers,
/// but it cannot accidentally separate WebKit lifetime from bridge/media
/// lifetime or leave an awaiting picker continuation behind on dismissal.
@MainActor
final class MobileEditorHostSession {
    let mediaImports: NativeMediaImportCoordinator
    let environment: MobileEditorEnvironment

    private(set) var webView: WKWebView?
    private var isClosed = false

    init(model: AppModel) throws {
        let mediaImports = NativeMediaImportCoordinator()
        self.mediaImports = mediaImports
        environment = try model.makeMobileEditorEnvironment { payload in
            try await mediaImports.request(payload)
        }
    }

    func makeWebView() -> WKWebView {
        precondition(!isClosed, "A closed AyahClip host session cannot be reopened.")
        if let webView { return webView }
        let created = environment.makeWebView()
        webView = created
        return created
    }

    func close() {
        guard !isClosed else { return }
        isClosed = true
        webView?.stopLoading()
        environment.close()
        mediaImports.close()
        webView = nil
    }
}
