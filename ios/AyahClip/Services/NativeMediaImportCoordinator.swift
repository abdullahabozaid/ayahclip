import Foundation
import Observation
import UniformTypeIdentifiers

/// Main-actor rendezvous between the shared Studio's async media request and
/// the SwiftUI Photos/Files presentation owned by the eventual approved host.
/// Only one system picker may be active at a time; every continuation is
/// resumed exactly once on selection, cancellation, replacement or teardown.
@MainActor
@Observable
final class NativeMediaImportCoordinator {
    struct PendingRequest: Identifiable, Equatable {
        let id: UUID
        let payload: MobileMediaImportRequestPayload
    }

    enum ImportError: LocalizedError, Equatable {
        case invalidRequest
        case pickerBusy
        case cancelled
        case invalidSelection

        var errorDescription: String? {
            switch self {
            case .invalidRequest:
                "The editor requested an invalid media selection."
            case .pickerBusy:
                "Finish the current media selection before opening another one."
            case .cancelled:
                "Media selection was cancelled."
            case .invalidSelection:
                "The selected files do not match the media requested by this tool."
            }
        }
    }

    private(set) var pendingRequest: PendingRequest?
    private var continuation: CheckedContinuation<[URL], any Error>?

    func request(_ payload: MobileMediaImportRequestPayload) async throws -> [URL] {
        guard payload.isValid else { throw ImportError.invalidRequest }
        guard continuation == nil else { throw ImportError.pickerBusy }

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                self.pendingRequest = PendingRequest(id: UUID(), payload: payload)
                self.continuation = continuation
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.cancel() }
        }
    }

    func complete(with urls: [URL]) {
        guard let request = pendingRequest, let continuation else { return }
        clearPending()
        guard !urls.isEmpty,
              urls.count <= request.payload.maxCount,
              urls.allSatisfy({ Self.accepts($0, for: request.payload) }) else {
            continuation.resume(throwing: ImportError.invalidSelection)
            return
        }
        continuation.resume(returning: urls)
    }

    func cancel() {
        guard let continuation else {
            pendingRequest = nil
            return
        }
        clearPending()
        continuation.resume(throwing: ImportError.cancelled)
    }

    func close() {
        cancel()
    }

    static func allowedContentTypes(
        for payload: MobileMediaImportRequestPayload
    ) -> [UTType] {
        payload.kinds.compactMap { kind in
            switch kind {
            case .image: .image
            case .video: .movie
            case .audio: .audio
            }
        }
    }

    private static func accepts(
        _ url: URL,
        for payload: MobileMediaImportRequestPayload
    ) -> Bool {
        guard let type = UTType(filenameExtension: url.pathExtension) else { return false }
        return payload.kinds.contains { kind in
            switch kind {
            case .image: type.conforms(to: .image)
            case .video: type.conforms(to: .movie) || type.conforms(to: .video)
            case .audio: type.conforms(to: .audio)
            }
        }
    }

    private func clearPending() {
        pendingRequest = nil
        continuation = nil
    }
}
