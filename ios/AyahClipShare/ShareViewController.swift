import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let statusLabel = UILabel()
    private let doneButton = UIButton(type: .system)
    private let suiteName = "group.app.ayahclip.mobile"

    private enum ReceivedItem {
        case media
        case reference
        case unsupported
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        Task { await receiveSharedItem() }
    }

    private func configureView() {
        view.backgroundColor = UIColor(red: 0.025, green: 0.035, blue: 0.055, alpha: 1)

        let mark = UIImageView(image: UIImage(systemName: "waveform.path"))
        mark.tintColor = UIColor(red: 0.79, green: 0.65, blue: 0.42, alpha: 1)
        mark.contentMode = .scaleAspectFit
        mark.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 34, weight: .medium)

        statusLabel.text = "Preparing for AyahClip…"
        statusLabel.textColor = UIColor(red: 0.93, green: 0.91, blue: 0.86, alpha: 1)
        statusLabel.font = .preferredFont(forTextStyle: .headline)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        doneButton.setTitle("Done", for: .normal)
        doneButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        doneButton.tintColor = UIColor(red: 0.79, green: 0.65, blue: 0.42, alpha: 1)
        doneButton.isHidden = true
        doneButton.addTarget(self, action: #selector(finish), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [mark, statusLabel, doneButton])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            doneButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
    }

    private func receiveSharedItem() async {
        let providers = extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] } ?? []
        guard !providers.isEmpty else {
            showResult("Nothing was shared. Try the original video file or a post link.")
            return
        }

        var mediaCount = 0
        var referenceCount = 0
        var failureCount = 0
        for provider in providers {
            do {
                switch try await receive(provider) {
                case .media: mediaCount += 1
                case .reference: referenceCount += 1
                case .unsupported: failureCount += 1
                }
            } catch {
                failureCount += 1
            }
        }

        if mediaCount > 0 {
            let noun = mediaCount == 1 ? "media item" : "media items"
            let failedNoun = failureCount == 1 ? "item" : "items"
            let suffix = failureCount > 0
                ? " \(failureCount) \(failedNoun) could not be copied."
                : ""
            showResult("\(mediaCount) \(noun) saved privately. Open AyahClip to begin editing.\(suffix)")
        } else if referenceCount > 0 {
            showResult("Post reference saved. Open AyahClip and attach the original file you own.")
        } else {
            showResult("No supported photo, video, or TikTok, Instagram, or YouTube link was found.")
        }
    }

    private func receive(_ provider: NSItemProvider) async throws -> ReceivedItem {
        if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
            let source = try await SharedMediaProviderLoader.loadFile(
                from: provider,
                type: .movie
            )
            defer { try? FileManager.default.removeItem(at: source) }
            try storeFile(source)
            return .media
        } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            let source = try await SharedMediaProviderLoader.loadFile(
                from: provider,
                type: .image
            )
            defer { try? FileManager.default.removeItem(at: source) }
            try storeFile(source)
            return .media
        } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            let item = try await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
            guard let url = item as? URL else { throw CocoaError(.fileReadUnknown) }
            return storeLink(url.absoluteString) ? .reference : .unsupported
        } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            let item = try await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier)
            guard let text = item as? String else { throw CocoaError(.fileReadUnknown) }
            return storeLink(text) ? .reference : .unsupported
        } else {
            return .unsupported
        }
    }

    private func storeFile(_ source: URL) throws {
        let didAccess = source.startAccessingSecurityScopedResource()
        defer { if didAccess { source.stopAccessingSecurityScopedResource() } }
        guard let group = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: suiteName
        ) else { throw CocoaError(.fileNoSuchFile) }
        let inbox = group.appendingPathComponent("Incoming", isDirectory: true)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            throw CocoaError(.fileWriteUnknown)
        }
        var queuedFiles = defaults.stringArray(forKey: "pendingSharedFiles") ?? []
        if let legacyFile = defaults.string(forKey: "pendingSharedFile"),
           !queuedFiles.contains(legacyFile) {
            queuedFiles.insert(legacyFile, at: 0)
        }
        try MediaImportPolicy.validateBatch(attachedCount: queuedFiles.count, incomingCount: 1)
        let sourceBytes = Int64(
            try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        )
        let availableBytes = try inbox.resourceValues(
            forKeys: [.volumeAvailableCapacityForImportantUsageKey]
        ).volumeAvailableCapacityForImportantUsage
        try MediaImportPolicy.validateFile(fileBytes: sourceBytes, availableBytes: availableBytes)

        let ext = source.pathExtension.isEmpty ? "mov" : source.pathExtension
        let destination = inbox.appendingPathComponent("\(UUID().uuidString).\(ext)")
        try FileManager.default.copyItem(at: source, to: destination)
        queuedFiles.append(destination.lastPathComponent)
        defaults.set(queuedFiles, forKey: "pendingSharedFiles")
        defaults.removeObject(forKey: "pendingSharedFile")
    }

    @discardableResult
    private func storeLink(_ value: String) -> Bool {
        guard let url = SocialReferencePolicy.normalizedURL(from: value) else { return false }
        UserDefaults(suiteName: suiteName)?.set(url.absoluteString, forKey: "pendingSharedLink")
        return true
    }

    @MainActor
    private func showResult(_ message: String) {
        statusLabel.text = message
        doneButton.isHidden = false
    }

    @objc private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
