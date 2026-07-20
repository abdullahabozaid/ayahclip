import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct MobileEditorHostView: View {
    @Environment(AppModel.self) private var model
    @State private var session: MobileEditorHostSession?
    @State private var hostedWebView: WKWebView?
    @State private var startupError: String?
    @State private var showSourceChooser = false
    @State private var showPhotoPicker = false
    @State private var showFileImporter = false
    @State private var photoSelections: [PhotosPickerItem] = []
    private let showsCloseButton: Bool

    init(
        model: AppModel,
        entryPoint: MobileEditorEntryPoint = .editor,
        showsCloseButton: Bool = true
    ) {
        self.showsCloseButton = showsCloseButton
        do {
            let session = try MobileEditorHostSession(model: model, entryPoint: entryPoint)
            _session = State(initialValue: session)
            _hostedWebView = State(initialValue: session.makeWebView())
            _startupError = State(initialValue: nil)
        } catch {
            _session = State(initialValue: nil)
            _hostedWebView = State(initialValue: nil)
            _startupError = State(initialValue: error.localizedDescription)
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            if let session, let hostedWebView {
                if showsCloseButton {
                    SharedStudioWebView(webView: hostedWebView)
                        .ignoresSafeArea(.container, edges: .bottom)
                        .accessibilityIdentifier("shared-studio-webview")
                } else {
                    // The web product already consumes CSS safe-area insets.
                    // Let it reach the screen edges so the status-bar inset is
                    // applied exactly once rather than producing a blank band.
                    SharedStudioWebView(webView: hostedWebView)
                        .ignoresSafeArea()
                        .accessibilityIdentifier("ayahclip-product-webview")
                }
                editorStateOverlay(session)
            } else {
                failureView(
                    message: startupError ?? "The mobile editor could not be opened.",
                    retry: false
                )
            }

            if showsCloseButton {
                Button {
                    session?.close()
                    model.closeEditor()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(.black.opacity(0.72), in: Circle())
                        .overlay(Circle().stroke(.white.opacity(0.14), lineWidth: 1))
                }
                .accessibilityLabel("Close editor")
                .padding(.top, 8)
                .padding(.leading, 12)
            }
        }
        .statusBarHidden(showsCloseButton)
        .onChange(of: session?.mediaImports.pendingRequest?.id) { _, requestID in
            if requestID != nil { showSourceChooser = true }
        }
        .confirmationDialog(
            "Add media",
            isPresented: $showSourceChooser,
            titleVisibility: .visible
        ) {
            if supportsPhotoLibrary {
                Button("Choose from Photos") { showPhotoPicker = true }
            }
            Button("Browse Files") { showFileImporter = true }
            Button("Cancel", role: .cancel) { session?.mediaImports.cancel() }
        } message: {
            Text("Choose media you own or have permission to use.")
        }
        .photosPicker(
            isPresented: $showPhotoPicker,
            selection: $photoSelections,
            maxSelectionCount: pendingMaxCount,
            matching: pendingPhotoFilter
        )
        .onChange(of: photoSelections) { _, items in
            guard !items.isEmpty else { return }
            Task { await completePhotoSelection(items) }
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: pendingContentTypes,
            allowsMultipleSelection: pendingMaxCount > 1
        ) { result in
            switch result {
            case let .success(urls): session?.mediaImports.complete(with: urls)
            case .failure: session?.mediaImports.cancel()
            }
        }
        .onDisappear { session?.close() }
    }

    @ViewBuilder
    private func editorStateOverlay(_ session: MobileEditorHostSession) -> some View {
        switch session.environment.pageState.status {
        case .loading:
            VStack {
                ProgressView("Opening Studio…")
                    .tint(AyahTheme.gold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.black.opacity(0.82), in: Capsule())
                Spacer()
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
            .allowsHitTesting(false)
        case .ready:
            EmptyView()
        case let .failed(message):
            failureView(message: message, retry: true)
        }
    }

    private func failureView(message: String, retry: Bool) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 30, weight: .medium))
                .foregroundStyle(AyahTheme.goldSoft)
            Text("Studio is unavailable")
                .font(.headline)
                .foregroundStyle(.white)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.68))
                .multilineTextAlignment(.center)
            if retry, let session, let hostedWebView {
                Button("Try again") { session.environment.reload(hostedWebView) }
                    .buttonStyle(.borderedProminent)
                    .tint(AyahTheme.gold)
                    .foregroundStyle(.black)
            }
        }
        .padding(26)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.94))
    }

    private var pendingPayload: MobileMediaImportRequestPayload? {
        session?.mediaImports.pendingRequest?.payload
    }

    private var pendingMaxCount: Int { pendingPayload?.maxCount ?? 1 }

    private var pendingContentTypes: [UTType] {
        pendingPayload.map(NativeMediaImportCoordinator.allowedContentTypes) ?? [.data]
    }

    private var supportsPhotoLibrary: Bool {
        pendingPayload?.kinds.contains(where: { $0 == .image || $0 == .video }) == true
    }

    private var pendingPhotoFilter: PHPickerFilter {
        let kinds = pendingPayload?.kinds ?? []
        var filters: [PHPickerFilter] = []
        if kinds.contains(.image) { filters.append(.images) }
        if kinds.contains(.video) { filters.append(.videos) }
        return filters.count == 1 ? filters[0] : .any(of: filters.isEmpty ? [.images, .videos] : filters)
    }

    private func completePhotoSelection(_ items: [PhotosPickerItem]) async {
        var urls: [URL] = []
        do {
            for item in items {
                guard let media = try await item.loadTransferable(type: MobilePickedMedia.self) else {
                    throw CocoaError(.fileReadUnknown)
                }
                urls.append(media.url)
            }
            session?.mediaImports.complete(with: urls)
        } catch {
            session?.mediaImports.cancel()
            model.notice = "Could not load that media: \(error.localizedDescription)"
        }
        photoSelections = []
    }
}

private struct SharedStudioWebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct MobilePickedMedia: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { media in
            SentTransferredFile(media.url)
        } importing: { received in
            try copyToTemporaryLocation(received.file, fallbackExtension: "mov")
        }
        FileRepresentation(contentType: .image) { media in
            SentTransferredFile(media.url)
        } importing: { received in
            try copyToTemporaryLocation(received.file, fallbackExtension: "jpg")
        }
    }

    private static func copyToTemporaryLocation(
        _ source: URL,
        fallbackExtension: String
    ) throws -> Self {
        let fileExtension = source.pathExtension.isEmpty ? fallbackExtension : source.pathExtension
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("studio-picker-\(UUID().uuidString).\(fileExtension)")
        try FileManager.default.copyItem(at: source, to: destination)
        return Self(url: destination)
    }
}
