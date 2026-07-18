import AVFoundation
import CoreImage
import UIKit
import UniformTypeIdentifiers

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
        try Task.checkCancellation()
        let asset = try await makeTimelineAsset(sourceURLs: sourceURLs, project: project)
        try Task.checkCancellation()
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
        let cancellation = ExportSessionCancellation(exportSession)

        do {
            await withTaskCancellationHandler {
                await exportSession.export()
            } onCancel: {
                cancellation.cancel()
            }
            try Task.checkCancellation()
            guard exportSession.status == .completed else {
                throw ExportError.exportFailed(
                    exportSession.error?.localizedDescription
                        ?? "The video renderer stopped before completion."
                )
            }
            return destination
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }

    static func makeTimelineAsset(sourceURLs: [URL], project: ClipProject) async throws -> AVAsset {
        guard !sourceURLs.isEmpty else { throw ExportError.noMedia }
        var preparedURLs: [URL] = []
        for sourceURL in sourceURLs {
            if isStillImage(sourceURL) {
                preparedURLs.append(try await makeStillVideo(
                    sourceURL: sourceURL,
                    duration: project.mediaDuration(for: sourceURL.lastPathComponent)
                ))
            } else {
                preparedURLs.append(sourceURL)
            }
        }

        let assets = preparedURLs.map(AVURLAsset.init(url:))
        var audioSource: (track: AVAssetTrack, duration: CMTime)?
        for asset in assets {
            guard let track = try await asset.loadTracks(withMediaType: .audio).first else { continue }
            let timeRange = try await track.load(.timeRange)
            guard timeRange.duration.seconds.isFinite, timeRange.duration.seconds > 0 else { continue }
            audioSource = (track, timeRange.duration)
            break
        }

        var videoSources: [(track: AVAssetTrack, duration: CMTime)] = []
        for asset in assets {
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { continue }
            let timeRange = try await track.load(.timeRange)
            guard timeRange.duration.seconds > 0 else { continue }
            videoSources.append((track, timeRange.duration))
        }
        guard !videoSources.isEmpty else { throw ExportError.noVideoTrack }

        let timelineDuration = audioSource?.duration ?? videoSources[0].duration
        let durationSeconds = timelineDuration.seconds
        guard durationSeconds.isFinite, durationSeconds > 0 else {
            throw ExportError.exportFailed("The selected media has no usable duration.")
        }

        if assets.count == 1, try await !assets[0].loadTracks(withMediaType: .video).isEmpty {
            return assets[0]
        }

        let composition = AVMutableComposition()
        if let audioSource,
           let audioTrack = composition.addMutableTrack(
               withMediaType: .audio,
               preferredTrackID: kCMPersistentTrackID_Invalid
           ) {
            try audioTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: audioSource.duration),
                of: audioSource.track,
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

    static func preferredTimelineDuration(
        sourceURLs: [URL],
        project: ClipProject
    ) async -> Double? {
        guard !sourceURLs.isEmpty else { return nil }
        for sourceURL in sourceURLs where !isStillImage(sourceURL) {
            let asset = AVURLAsset(url: sourceURL)
            guard let audio = try? await asset.loadTracks(withMediaType: .audio).first,
                  let timeRange = try? await audio.load(.timeRange),
                  timeRange.duration.seconds.isFinite,
                  timeRange.duration.seconds > 0 else { continue }
            return timeRange.duration.seconds
        }
        for sourceURL in sourceURLs where !isStillImage(sourceURL) {
            let asset = AVURLAsset(url: sourceURL)
            guard let video = try? await asset.loadTracks(withMediaType: .video).first,
                  let timeRange = try? await video.load(.timeRange),
                  timeRange.duration.seconds.isFinite,
                  timeRange.duration.seconds > 0 else { continue }
            return timeRange.duration.seconds
        }
        if let imageURL = sourceURLs.first(where: isStillImage) {
            return project.mediaDuration(for: imageURL.lastPathComponent)
        }
        return nil
    }

    private static func isStillImage(_ url: URL) -> Bool {
        UTType(filenameExtension: url.pathExtension)?.conforms(to: .image) == true
    }

    private static func makeStillVideo(sourceURL: URL, duration: Double) async throws -> URL {
        guard let image = UIImage(contentsOfFile: sourceURL.path) else {
            throw ExportError.exportFailed("That photo could not be decoded on this device.")
        }
        let safeDuration = max(0.25, duration)
        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AyahClipStillCache", isDirectory: true)
        try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        let identity = UInt(bitPattern: sourceURL.path.hashValue)
        let destination = cacheDirectory.appendingPathComponent(
            "still-\(identity)-\(Int((safeDuration * 1_000).rounded())).mp4"
        )
        if FileManager.default.fileExists(atPath: destination.path),
           let cachedDuration = try? await AVURLAsset(url: destination).load(.duration).seconds,
           cachedDuration >= safeDuration - 0.05 {
            return destination
        }
        try? FileManager.default.removeItem(at: destination)

        let renderSize = outputSize
        let width = Int(renderSize.width.rounded())
        let height = Int(renderSize.height.rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: renderSize, format: format).image { _ in
            UIColor.black.setFill()
            UIRectFill(CGRect(origin: .zero, size: renderSize))
            let scale = max(renderSize.width / image.size.width, renderSize.height / image.size.height)
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            image.draw(in: CGRect(
                x: (renderSize.width - size.width) / 2,
                y: (renderSize.height - size.height) / 2,
                width: size.width,
                height: size.height
            ))
        }
        guard let renderedImage = rendered.cgImage else {
            throw ExportError.exportFailed("That photo could not be prepared for video export.")
        }

        let writer = try AVAssetWriter(outputURL: destination, fileType: .mp4)
        let input = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height
            ]
        )
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height
            ]
        )
        guard writer.canAdd(input) else {
            throw ExportError.exportFailed("This device could not create a video track for that photo.")
        }
        writer.add(input)
        guard writer.startWriting() else {
            throw writer.error ?? ExportError.exportFailed("Photo video preparation could not start.")
        }
        writer.startSession(atSourceTime: .zero)

        while !input.isReadyForMoreMediaData { await Task.yield() }
        var pixelBuffer: CVPixelBuffer?
        CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32BGRA,
            nil,
            &pixelBuffer
        )
        guard let pixelBuffer else {
            throw ExportError.exportFailed("This device could not allocate a photo video frame.")
        }
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue
                | CGImageAlphaInfo.premultipliedFirst.rawValue
        ) else {
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
            throw ExportError.exportFailed("This device could not draw a photo video frame.")
        }
        context.draw(renderedImage, in: CGRect(origin: .zero, size: renderSize))
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        guard adaptor.append(pixelBuffer, withPresentationTime: .zero) else {
            throw writer.error ?? ExportError.exportFailed("The photo frame could not be added to the video.")
        }
        writer.endSession(atSourceTime: CMTime(seconds: safeDuration, preferredTimescale: 600))
        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else {
            try? FileManager.default.removeItem(at: destination)
            throw writer.error ?? ExportError.exportFailed("Photo video preparation did not finish.")
        }
        return destination
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

private final class ExportSessionCancellation: @unchecked Sendable {
    private let session: AVAssetExportSession

    init(_ session: AVAssetExportSession) {
        self.session = session
    }

    func cancel() {
        Task { @MainActor [self] in
            session.cancelExport()
        }
    }
}
