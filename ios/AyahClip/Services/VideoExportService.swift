import AVFoundation
import CoreImage
import UIKit

@MainActor
enum VideoExportService {
    static var outputSize: CGSize {
        #if targetEnvironment(simulator)
        CGSize(width: 540, height: 960)
        #else
        CGSize(width: 1080, height: 1920)
        #endif
    }

    enum ExportError: LocalizedError {
        case noVideoTrack
        case noMedia
        case cannotCreateExporter
        case exportFailed(String)

        var errorDescription: String? {
            switch self {
            case .noVideoTrack: "The selected file has no video track."
            case .noMedia: "Add a recitation or video before exporting."
            case .cannotCreateExporter: "This video format cannot be exported on this device."
            case let .exportFailed(message): message
            }
        }
    }

    static func render(sourceURL: URL, project: ClipProject) async throws -> URL {
        try await render(sourceURLs: [sourceURL], project: project)
    }

    static func render(sourceURLs: [URL], project: ClipProject) async throws -> URL {
        let asset = try await makeTimelineAsset(sourceURLs: sourceURLs, project: project)
        guard try await asset.loadTracks(withMediaType: .video).first != nil else {
            throw ExportError.noVideoTrack
        }
        _ = try await asset.load(.duration)

        let renderSize = outputSize
        let renderRect = CGRect(origin: .zero, size: renderSize)
        let timedCaptions = project.segments.compactMap { segment -> (Range<Double>, CIImage)? in
            guard let content = project.captions(at: segment.start) else { return nil }
            guard let plate = makeCaptionPlate(
                project: project,
                content: content,
                renderSize: renderSize
            ) else { return nil }
            return (segment.start..<segment.end, CIImage(cgImage: plate))
        }
        let untimedCaption = project.segments.isEmpty
            ? makeCaptionPlate(
                project: project,
                content: CaptionContent(arabic: project.arabic, translation: project.translation),
                renderSize: renderSize
            ).map(CIImage.init(cgImage:))
            : nil

        // Core Image is used for the production compositor because it renders the
        // same pixels in previews, tests and exports. Core Animation text layers
        // can terminate VideoToolbox exports in the iOS Simulator.
        let videoComposition = AVMutableVideoComposition(
            asset: asset,
            applyingCIFiltersWithHandler: { request in
                let source = request.sourceImage
                let extent = source.extent
                let scale = max(renderSize.width / extent.width, renderSize.height / extent.height)
                let scaled = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
                let scaledExtent = scaled.extent
                let centered = scaled.transformed(by: CGAffineTransform(
                    translationX: renderRect.midX - scaledExtent.midX,
                    y: renderRect.midY - scaledExtent.midY
                ))
                let video = centered.cropped(to: renderRect)
                let seconds = request.compositionTime.seconds
                let captionImage = timedCaptions.first(where: { $0.0.contains(seconds) })?.1
                    ?? untimedCaption
                let finished = captionImage?.composited(over: video).cropped(to: renderRect) ?? video
                request.finish(with: finished, context: nil)
            }
        )
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

        guard let exportSession = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetHighestQuality
        ) else { throw ExportError.cannotCreateExporter }

        let exportDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AyahClipExports", isDirectory: true)
        try FileManager.default.createDirectory(at: exportDirectory, withIntermediateDirectories: true)
        let destination = exportDirectory.appendingPathComponent("AyahClip-\(UUID().uuidString).mp4")
        exportSession.outputURL = destination
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true
        exportSession.videoComposition = videoComposition

        await exportSession.export()
        guard exportSession.status == .completed else {
            throw ExportError.exportFailed(
                exportSession.error?.localizedDescription
                    ?? "The video renderer stopped before completion."
            )
        }
        return destination
    }

    static func makeTimelineAsset(sourceURLs: [URL], project: ClipProject) async throws -> AVAsset {
        guard let primaryURL = sourceURLs.first else { throw ExportError.noMedia }
        let assets = sourceURLs.map(AVURLAsset.init(url:))
        let primary = assets[0]
        let primaryDuration = try await primary.load(.duration)
        let durationSeconds = primaryDuration.seconds
        guard durationSeconds.isFinite, durationSeconds > 0 else {
            throw ExportError.exportFailed("The primary media has no usable duration.")
        }

        var videoSources: [(track: AVAssetTrack, duration: CMTime)] = []
        for asset in assets {
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { continue }
            let timeRange = try await track.load(.timeRange)
            guard timeRange.duration.seconds > 0 else { continue }
            videoSources.append((track, timeRange.duration))
        }
        guard !videoSources.isEmpty else { throw ExportError.noVideoTrack }

        if assets.count == 1, try await !primary.loadTracks(withMediaType: .video).isEmpty {
            return primary
        }

        let composition = AVMutableComposition()
        if let sourceAudio = try await primary.loadTracks(withMediaType: .audio).first,
           let audioTrack = composition.addMutableTrack(
               withMediaType: .audio,
               preferredTrackID: kCMPersistentTrackID_Invalid
           ) {
            let sourceRange = try await sourceAudio.load(.timeRange)
            let audioDuration = CMTimeMinimum(sourceRange.duration, primaryDuration)
            try audioTrack.insertTimeRange(
                CMTimeRange(start: sourceRange.start, duration: audioDuration),
                of: sourceAudio,
                at: .zero
            )
        }

        guard let compositionVideo = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else { throw ExportError.noVideoTrack }
        compositionVideo.preferredTransform = try await videoSources[0].track.load(.preferredTransform)

        let boundaries = timelineBoundaries(project: project, duration: durationSeconds)
        var cursor = CMTime.zero
        for index in 0..<(boundaries.count - 1) {
            let intervalDuration = boundaries[index + 1] - boundaries[index]
            let source = videoSources[index % videoSources.count]
            var remaining = intervalDuration
            while remaining > 0.001 {
                let piece = min(remaining, source.duration.seconds)
                let sourceRange = try await source.track.load(.timeRange)
                try compositionVideo.insertTimeRange(
                    CMTimeRange(
                        start: sourceRange.start,
                        duration: CMTime(seconds: piece, preferredTimescale: 600)
                    ),
                    of: source.track,
                    at: cursor
                )
                cursor = cursor + CMTime(seconds: piece, preferredTimescale: 600)
                remaining -= piece
            }
        }
        return composition
    }

    private static func timelineBoundaries(project: ClipProject, duration: Double) -> [Double] {
        var values = [0.0]
        values.append(contentsOf: project.segments.map(\.end).filter { $0 > 0 && $0 < duration })
        values.append(duration)
        return values.sorted().reduce(into: []) { result, value in
            if result.last.map({ abs($0 - value) > 0.001 }) ?? true { result.append(value) }
        }
    }

    private static func makeCaptionPlate(
        project: ClipProject,
        content: CaptionContent,
        renderSize: CGSize
    ) -> CGImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: renderSize, format: format)
        return renderer.image { context in
            let canvasScale = renderSize.width / 1080
            drawBackdrop(
                project: project,
                renderSize: renderSize,
                context: context.cgContext
            )
            let centered = NSMutableParagraphStyle()
            centered.alignment = .center
            centered.baseWritingDirection = .rightToLeft

            let arabicBaseRect: CGRect
            let translationBaseRect: CGRect
            switch project.layout {
            case .centered:
                arabicBaseRect = CGRect(x: 90, y: 690, width: 900, height: 330)
                translationBaseRect = CGRect(x: 120, y: 1035, width: 840, height: 190)
            case .sideFade:
                arabicBaseRect = CGRect(x: 48, y: 660, width: 620, height: 390)
                translationBaseRect = CGRect(x: 62, y: 1060, width: 590, height: 250)
            case .lowerThird:
                arabicBaseRect = CGRect(x: 90, y: 1190, width: 900, height: 310)
                translationBaseRect = CGRect(x: 120, y: 1510, width: 840, height: 190)
            }

            let arabicRect = arabicBaseRect.applying(
                CGAffineTransform(scaleX: canvasScale, y: canvasScale)
            )
            let arabicFont = UIFont(
                name: "UthmanicHafs1Ver18",
                size: project.arabicSize * 2.4 * canvasScale * (project.layout == .sideFade ? 0.72 : 1)
            ) ?? UIFont.systemFont(
                ofSize: project.arabicSize * 2.4 * canvasScale * (project.layout == .sideFade ? 0.72 : 1)
            )
            let arabicColor = project.captionStyle == .gold
                ? UIColor(red: 0.84, green: 0.69, blue: 0.43, alpha: 1)
                : UIColor(red: 0.925, green: 0.906, blue: 0.855, alpha: 1)
            let strokeWidth: Double = switch project.captionStyle {
            case .softGlow: -1.4
            case .crispOutline: -3.5
            case .gold: -1.8
            case .clean: 0
            }
            let shadow = NSShadow()
            shadow.shadowColor = project.captionStyle == .softGlow
                ? UIColor.white.withAlphaComponent(0.42)
                : UIColor.black.withAlphaComponent(0.92)
            shadow.shadowBlurRadius = project.captionStyle == .softGlow ? 12 * canvasScale : 3 * canvasScale
            shadow.shadowOffset = CGSize(width: 0, height: canvasScale)

            (content.arabic as NSString).draw(
                with: arabicRect,
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: [
                    .font: arabicFont,
                    .foregroundColor: arabicColor,
                    .strokeColor: UIColor.black.withAlphaComponent(0.9),
                    .strokeWidth: strokeWidth,
                    .shadow: shadow,
                    .paragraphStyle: centered
                ],
                context: nil
            )

            centered.baseWritingDirection = .leftToRight
            let translationRect = translationBaseRect.applying(
                CGAffineTransform(scaleX: canvasScale, y: canvasScale)
            )
            (content.translation as NSString).draw(
                with: translationRect,
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: [
                    .font: UIFont.systemFont(
                        ofSize: project.translationSize * 2.25 * canvasScale
                            * (project.layout == .sideFade ? 0.84 : 1),
                        // A narrower side column needs a calmer measure, not word-per-line wrapping.
                        weight: .medium
                    ),
                    .foregroundColor: arabicColor.withAlphaComponent(0.94),
                    .strokeColor: UIColor.black.withAlphaComponent(0.9),
                    .strokeWidth: strokeWidth == 0 ? 0 : max(-2, strokeWidth * 0.6),
                    .shadow: shadow,
                    .paragraphStyle: centered
                ],
                context: nil
            )
        }.cgImage
    }

    private static func drawBackdrop(
        project: ClipProject,
        renderSize: CGSize,
        context: CGContext
    ) {
        if project.layout == .sideFade,
           let gradient = CGGradient(
               colorsSpace: CGColorSpaceCreateDeviceRGB(),
               colors: [
                   UIColor.black.withAlphaComponent(min(0.96, project.overlayOpacity + 0.5)).cgColor,
                   UIColor.black.withAlphaComponent(project.overlayOpacity).cgColor,
                   UIColor.clear.cgColor
               ] as CFArray,
               locations: [0, 0.52, 1]
           ) {
            context.drawLinearGradient(
                gradient,
                start: .zero,
                end: CGPoint(x: renderSize.width, y: 0),
                options: [.drawsAfterEndLocation]
            )
        } else {
            context.setFillColor(UIColor.black.withAlphaComponent(project.overlayOpacity).cgColor)
            context.fill(CGRect(origin: .zero, size: renderSize))
        }
    }
}
