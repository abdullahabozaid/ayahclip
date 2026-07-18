import Foundation
import Observation
@preconcurrency import WebKit

enum MobileEditorPageStatus: Equatable {
    case loading
    case ready
    case failed(String)
}

@MainActor
@Observable
final class MobileEditorPageState {
    private(set) var status: MobileEditorPageStatus = .loading

    func set(_ status: MobileEditorPageStatus) {
        self.status = status
    }
}

/// Retained dependencies for one shared-Studio web view. Keeping the registry,
/// scheme handler, session and script handler together prevents a web view from
/// being created with only part of the security contract installed.
@MainActor
final class MobileEditorEnvironment {
    let configuration: WKWebViewConfiguration
    let editorURL: URL
    let hydrateEnvelope: MobileBridgeEnvelope<MobileProjectSnapshotV1>
    let pageState: MobileEditorPageState

    private let registry: NativeMediaRegistry
    private let session: MobileEditorSession
    private let schemeHandler: NativeMediaSchemeHandler
    private let messageHandler: MobileEditorMessageHandler
    private let navigationDelegate: MobileEditorNavigationDelegate
    private var isClosed = false

    init(
        project: ClipProject,
        mediaURLs: [URL],
        allowedMediaRoots: [URL]? = nil,
        onProjectChange: @escaping @MainActor (
            MobileBridgeEnvelope<MobileProjectSnapshotV1>,
            MobileEditorSession
        ) throws -> Void,
        onExportComplete: @escaping @MainActor (URL) async throws -> Void = { _ in },
        onMediaImportRequest: @escaping @MainActor (
            MobileMediaImportRequestPayload,
            MobileEditorSession
        ) async throws -> MobileMediaImportResultPayload = { _, _ in
            throw MobileEditorSession.SessionError.unsupportedMessage
        }
    ) throws {
        let pageState = MobileEditorPageState()
        self.pageState = pageState
        navigationDelegate = MobileEditorNavigationDelegate(pageState: pageState)
        let roots = allowedMediaRoots
            ?? Array(Set(mediaURLs.map { $0.deletingLastPathComponent() }))
        registry = NativeMediaRegistry(allowedRoots: roots)
        session = MobileEditorSession(registry: registry)
        hydrateEnvelope = try session.prepare(project: project, mediaURLs: mediaURLs)
        schemeHandler = NativeMediaSchemeHandler(registry: registry)
        messageHandler = try MobileEditorMessageHandler(
            hydrateEnvelope: hydrateEnvelope,
            onProjectChange: { [session] envelope in
                try onProjectChange(envelope, session)
            },
            onExportComplete: onExportComplete,
            onMediaImportRequest: { [session] payload in
                try await onMediaImportRequest(payload, session)
            }
        )

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.setURLSchemeHandler(
            schemeHandler,
            forURLScheme: NativeMediaSchemeHandler.scheme
        )
        configuration.userContentController.addScriptMessageHandler(
            messageHandler,
            contentWorld: .page,
            name: MobileEditorMessageHandler.name
        )
        self.configuration = configuration
        editorURL = MobileEditorBridgeContract.editorURL(
            projectID: project.id,
            requiresPassageSelection: project.surahID == nil
        )
    }

    /// Creates the single runnable shared-editor web view. Presentation and
    /// layout remain the responsibility of the approved SwiftUI host, while
    /// configuration, navigation confinement and bridge lifetime stay here.
    func makeWebView() -> WKWebView {
        precondition(!isClosed, "A closed AyahClip editor session cannot be reopened.")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = navigationDelegate
        webView.allowsBackForwardNavigationGestures = false
        webView.customUserAgent = "AyahClip-iOS/0.1 SharedStudio"
        let request = URLRequest(
            url: editorURL,
            cachePolicy: .reloadRevalidatingCacheData,
            timeoutInterval: 30
        )
        webView.load(request)
        return webView
    }

    func close() {
        guard !isClosed else { return }
        isClosed = true
        configuration.userContentController.removeScriptMessageHandler(
            forName: MobileEditorMessageHandler.name,
            contentWorld: .page
        )
        messageHandler.close()
        session.close()
    }

    func reload(_ webView: WKWebView) {
        guard !isClosed else { return }
        pageState.set(.loading)
        webView.load(URLRequest(
            url: editorURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 30
        ))
    }

    func hasActiveMediaHandle(_ handle: String) -> Bool {
        (try? registry.responsePlan(handle: handle, rangeHeader: nil)) != nil
    }
}

enum MobileEditorNavigationPolicy {
    static func allows(url: URL?, isMainFrame: Bool) -> Bool {
        guard isMainFrame, let url else { return false }
        return MobileEditorBridgeContract.allowsNavigation(to: url)
    }
}

@MainActor
private final class MobileEditorNavigationDelegate: NSObject, WKNavigationDelegate {
    private let pageState: MobileEditorPageState

    init(pageState: MobileEditorPageState) {
        self.pageState = pageState
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        return MobileEditorNavigationPolicy.allows(
            url: navigationAction.request.url,
            isMainFrame: isMainFrame
        ) ? .allow : .cancel
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        pageState.set(.loading)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageState.set(.ready)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: any Error
    ) {
        pageState.set(.failed(error.localizedDescription))
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: any Error
    ) {
        pageState.set(.failed(error.localizedDescription))
    }
}
