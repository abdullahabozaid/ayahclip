import Foundation
import UniformTypeIdentifiers

@MainActor
enum SharedMediaProviderLoader {
    enum LoaderError: LocalizedError {
        case unavailable

        var errorDescription: String? {
            "The shared photo or video could not be copied from the source app."
        }
    }

    /// Copies the provider-owned representation before its completion handler
    /// returns. Photos commonly vends images as UIImage/data instead of a URL;
    /// `loadFileRepresentation` normalizes those forms without loading a large
    /// movie into extension memory.
    static func loadFile(from provider: NSItemProvider, type: UTType) async throws -> URL {
        guard provider.hasItemConformingToTypeIdentifier(type.identifier) else {
            throw LoaderError.unavailable
        }
        return try await withCheckedThrowingContinuation { continuation in
            _ = provider.loadFileRepresentation(
                for: type,
                openInPlace: false
            ) { source, _, error in
                do {
                    if let error { throw error }
                    guard let source else { throw LoaderError.unavailable }
                    let directory = FileManager.default.temporaryDirectory
                        .appendingPathComponent("AyahClipShare", isDirectory: true)
                    try FileManager.default.createDirectory(
                        at: directory,
                        withIntermediateDirectories: true
                    )
                    let fileExtension = source.pathExtension.isEmpty
                        ? (type.preferredFilenameExtension ?? "bin")
                        : source.pathExtension
                    let destination = directory
                        .appendingPathComponent("\(UUID().uuidString).\(fileExtension)")
                    try FileManager.default.copyItem(at: source, to: destination)
                    continuation.resume(returning: destination)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}
