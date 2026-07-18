import AVFoundation
import CoreImage

@MainActor
enum WatermarkCleanupService {
    enum CleanupError: LocalizedError {
        case noVideoTrack
        case cannotCreateExporter
        case exportFailed(String)

        var errorDescription: String? {
            switch self {
            case .noVideoTrack: "The selected file has no video track."
            case .cannotCreateExporter: "This video cannot be cleaned on this device."
            case let .exportFailed(message): message
            }
        }
    }

    /// Conceals both zones used by TikTok's moving watermark using pixels from
    /// the adjacent frame area. Unlike the previous broad Gaussian blur, this
    /// keeps text and faces outside the watermark regions sharp. The operation
    /// is intentionally local-only and accepts an existing user-selected file;
    /// it never downloads or resolves third-party post URLs.
    static func cleanCommonTikTokZones(sourceURL: URL) async throws -> URL {
        let asset = AVURLAsset(url: sourceURL)
        guard try await asset.loadTracks(withMediaType: .video).first != nil else {
            throw CleanupError.noVideoTrack
        }

        let composition = AVMutableVideoComposition(
            asset: asset,
            applyingCIFiltersWithHandler: { request in
                let source = request.sourceImage
                let extent = source.extent
                let output = watermarkRegions(in: extent).reduce(source) { image, region in
                    concealedPatch(from: source, over: region, in: extent)
                        .composited(over: image)
                }
                request.finish(with: output.cropped(to: extent), context: nil)
            }
        )

        guard let exporter = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetHighestQuality
        ) else { throw CleanupError.cannotCreateExporter }

        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AyahClipWatermarkCleanup", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent("cleaned-\(UUID().uuidString).mp4")
        exporter.outputURL = destination
        exporter.outputFileType = .mp4
        exporter.shouldOptimizeForNetworkUse = true
        exporter.videoComposition = composition
        let cancellation = WatermarkExportCancellation(exporter)

        do {
            await withTaskCancellationHandler {
                await exporter.export()
            } onCancel: {
                cancellation.cancel()
            }
            try Task.checkCancellation()
            guard exporter.status == .completed else {
                throw CleanupError.exportFailed(
                    exporter.error?.localizedDescription ?? "Watermark cleanup did not finish."
                )
            }
            return destination
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }

    nonisolated static func watermarkRegions(in extent: CGRect) -> [CGRect] {
        guard extent.width > 0, extent.height > 0 else { return [] }
        let width = extent.width * 0.43
        let height = extent.height * 0.15
        return [
            CGRect(
                x: extent.minX + extent.width * 0.025,
                y: extent.minY + extent.height * 0.79,
                width: width,
                height: height
            ),
            CGRect(
                x: extent.minX + extent.width * 0.545,
                y: extent.minY + extent.height * 0.055,
                width: width,
                height: height
            )
        ].map { $0.intersection(extent) }
    }

    /// Stretches a narrow strip immediately beside a watermark over the marked
    /// area, then softens only the patch boundary. This is deterministic and
    /// avoids the conspicuous translucent logo left by blurring the watermark
    /// itself.
    nonisolated static func concealedPatch(
        from source: CIImage,
        over region: CGRect,
        in extent: CGRect
    ) -> CIImage {
        let sampleWidth = max(4, region.width * 0.08)
        let isLeftZone = region.midX < extent.midX
        let proposedSample = CGRect(
            x: isLeftZone ? region.maxX : region.minX - sampleWidth,
            y: region.minY,
            width: sampleWidth,
            height: region.height
        ).intersection(extent)
        guard proposedSample.width > 0, proposedSample.height > 0 else {
            return source.cropped(to: region)
        }

        let transform = CGAffineTransform(
            a: region.width / proposedSample.width,
            b: 0,
            c: 0,
            d: region.height / proposedSample.height,
            tx: region.minX - proposedSample.minX * (region.width / proposedSample.width),
            ty: region.minY - proposedSample.minY * (region.height / proposedSample.height)
        )
        return source
            .cropped(to: proposedSample)
            .transformed(by: transform)
            .cropped(to: region)
            .applyingFilter("CIMedianFilter")
            .cropped(to: region)
    }
}

private final class WatermarkExportCancellation: @unchecked Sendable {
    private let exporter: AVAssetExportSession

    init(_ exporter: AVAssetExportSession) {
        self.exporter = exporter
    }

    func cancel() {
        Task { @MainActor [exporter] in exporter.cancelExport() }
    }
}
