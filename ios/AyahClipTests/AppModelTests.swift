import AVFoundation
import CoreImage
import XCTest
@testable import AyahClip

@MainActor
final class AppModelTests: XCTestCase {
    func testStarterProjectHasOrderedVerseSegments() {
        let segments = ClipProject.starter.segments
        XCTAssertEqual(segments.map(\.verse), [1, 2, 3])
        XCTAssertTrue(zip(segments, segments.dropFirst()).allSatisfy { $0.end <= $1.start })
    }

    func testTimelineResolvesDifferentVerseCaptions() throws {
        let project = ClipProject.starter
        let first = try XCTUnwrap(project.captions(at: 1))
        let second = try XCTUnwrap(project.captions(at: 6))
        let third = try XCTUnwrap(project.captions(at: 12))

        XCTAssertNotEqual(first.arabic, second.arabic)
        XCTAssertNotEqual(second.arabic, third.arabic)
        XCTAssertTrue(first.translation.hasPrefix("Blessed is He"))
        XCTAssertTrue(second.translation.hasPrefix("He who created death"))
        XCTAssertNil(project.captions(at: 16.01))
    }

    func testVerseSegmentsFitImportedMediaDuration() throws {
        var project = ClipProject.starter
        project.fitSegments(to: 32)

        XCTAssertEqual(try XCTUnwrap(project.segments.first?.start), 0, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(project.segments.first?.end), 10, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(project.segments.last?.end), 32, accuracy: 0.001)
        XCTAssertEqual(project.captions(at: 31)?.translation, project.segments.last?.translation)
    }

    func testTimelineCanSplitAndRemoveVerseSegments() throws {
        var project = ClipProject.starter
        let firstID = try XCTUnwrap(project.segments.first?.id)
        let newID = try XCTUnwrap(project.splitSegment(id: firstID, at: 2.5))

        XCTAssertEqual(project.segments.count, 4)
        XCTAssertEqual(project.segments[0].end, 2.5, accuracy: 0.001)
        XCTAssertEqual(project.segments[1].start, 2.5, accuracy: 0.001)
        XCTAssertEqual(project.segments[1].arabic, "")
        XCTAssertEqual(project.segments.map(\.verse), [1, 2, 3, 4])

        XCTAssertNotNil(project.removeSegment(id: newID))
        XCTAssertEqual(project.segments.count, 3)
        XCTAssertEqual(project.segments[0].end, 5, accuracy: 0.001)
        XCTAssertEqual(project.segments.map(\.verse), [1, 2, 3])
    }

    func testEditingActiveProjectIsImmediateAndReversible() {
        let model = AppModel()
        model.createProject()
        let original = model.activeProject?.arabicSize
        model.updateActive { $0.arabicSize = 48 }
        XCTAssertEqual(model.activeProject?.arabicSize, 48)
        model.updateActive { $0.arabicSize = original ?? 36 }
        XCTAssertEqual(model.activeProject?.arabicSize, original)
    }

    func testNewClipDeepLinkOpensEditor() throws {
        let model = AppModel()
        XCTAssertNil(model.activeProject)

        model.receiveSharedURL(try XCTUnwrap(URL(string: "ayahclip://new")))

        XCTAssertEqual(model.activeProject?.title, ClipProject.starter.title)
    }

    func testVideoExportProducesVerticalCaptionedMP4() async throws {
        let source = try await makeTestVideo()
        let output = try await VideoExportService.render(sourceURL: source, project: .starter)
        let asset = AVURLAsset(url: output)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        let track = try XCTUnwrap(tracks.first)
        let size = try await track.load(.naturalSize)

        XCTAssertTrue(FileManager.default.fileExists(atPath: output.path))
        XCTAssertGreaterThan(
            (try FileManager.default.attributesOfItem(atPath: output.path)[.size] as? NSNumber)?.intValue ?? 0,
            1_000
        )
        XCTAssertEqual(size.width, VideoExportService.outputSize.width, accuracy: 1)
        XCTAssertEqual(size.height, VideoExportService.outputSize.height, accuracy: 1)
    }

    func testBrollSequenceRotatesVisualsAtVerseBoundary() async throws {
        let blue = try await makeTestVideo(
            color: CIColor(red: 0.02, green: 0.08, blue: 0.92),
            frameCount: 60
        )
        let red = try await makeTestVideo(
            color: CIColor(red: 0.92, green: 0.04, blue: 0.03),
            frameCount: 60
        )
        var project = ClipProject.starter
        project.overlayOpacity = 0
        project.segments = [
            VerseSegment(verse: 1, start: 0, end: 1, arabic: "", translation: ""),
            VerseSegment(verse: 2, start: 1, end: 2, arabic: "", translation: "")
        ]

        let output = try await VideoExportService.render(
            sourceURLs: [blue, red],
            project: project
        )
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: output))
        generator.appliesPreferredTrackTransform = true
        let firstFrame = try await generator.image(
            at: CMTime(seconds: 0.25, preferredTimescale: 600)
        ).image
        let secondFrame = try await generator.image(
            at: CMTime(seconds: 1.25, preferredTimescale: 600)
        ).image
        let firstColor = averageRGB(image: firstFrame)
        let secondColor = averageRGB(image: secondFrame)

        XCTAssertGreaterThan(firstColor.blue, firstColor.red * 3)
        XCTAssertGreaterThan(secondColor.red, secondColor.blue * 3)
    }

    func testAudioLedBrollExportPreservesPrimaryAudio() async throws {
        let recitation = try makeSilentAudio(duration: 2)
        let firstVisual = try await makeTestVideo(frameCount: 60)
        let secondVisual = try await makeTestVideo(
            color: CIColor(red: 0.30, green: 0.08, blue: 0.02),
            frameCount: 60
        )
        var project = ClipProject.starter
        project.segments = [
            VerseSegment(verse: 1, start: 0, end: 1),
            VerseSegment(verse: 2, start: 1, end: 2)
        ]

        let output = try await VideoExportService.render(
            sourceURLs: [recitation, firstVisual, secondVisual],
            project: project
        )
        let asset = AVURLAsset(url: output)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let duration = try await asset.load(.duration).seconds

        XCTAssertEqual(audioTracks.count, 1)
        XCTAssertEqual(videoTracks.count, 1)
        XCTAssertEqual(duration, 2, accuracy: 0.08)
    }

    func testAudioAndBrollImportCreatesEditableSequence() async throws {
        let recitation = try makeSilentAudio(duration: 2)
        let visual = try await makeTestVideo(frameCount: 60)
        let model = AppModel()
        model.projects = []
        model.activeProject = nil

        await model.importMedia(from: [recitation, visual])

        XCTAssertEqual(model.importedMediaURLs.count, 2)
        XCTAssertNotNil(model.activeProject?.mediaFilename)
        XCTAssertEqual(model.activeProject?.bRollFilenames?.count, 1)
        XCTAssertEqual(try XCTUnwrap(model.activeProject?.segments.last?.end), 2, accuracy: 0.08)

        model.saveActiveProject()
        if let saved = model.projects.first { model.delete(saved) }
        model.activeProject = nil
    }

    func testSideFadePresetDarkensCaptionSideAndExports() async throws {
        let source = try await makeTestVideo()
        var project = ClipProject.starter
        project.layout = .sideFade
        project.captionStyle = .gold
        let output = try await VideoExportService.render(sourceURL: source, project: project)
        let asset = AVURLAsset(url: output)
        let generator = AVAssetImageGenerator(asset: asset)
        let image = try await generator.image(at: CMTime(seconds: 0.25, preferredTimescale: 600)).image

        let left = averageLuminance(image: image, xRange: 0..<(image.width / 4))
        let right = averageLuminance(image: image, xRange: (image.width * 3 / 4)..<image.width)
        XCTAssertLessThan(left, right * 0.78)
    }

    func testStyleSelectionsRoundTripThroughProjectStorage() throws {
        var project = ClipProject.starter
        project.layout = .lowerThird
        project.captionStyle = .crispOutline
        project.mediaFilename = "recitation.mp4"
        project.bRollFilenames = ["ocean.mp4", "masjid.mp4"]
        project.sourceReferenceURL = "https://youtube.com/shorts/abc123"
        let decoded = try JSONDecoder().decode(
            ClipProject.self,
            from: JSONEncoder().encode(project)
        )
        XCTAssertEqual(decoded.layout, .lowerThird)
        XCTAssertEqual(decoded.captionStyle, .crispOutline)
        XCTAssertEqual(decoded.allMediaFilenames, ["recitation.mp4", "ocean.mp4", "masjid.mp4"])
        XCTAssertEqual(decoded.sourceReferenceURL, "https://youtube.com/shorts/abc123")
        var reordered = decoded
        reordered.setMediaFilenames(["masjid.mp4", "recitation.mp4"])
        XCTAssertEqual(reordered.mediaFilename, "masjid.mp4")
        XCTAssertEqual(reordered.bRollFilenames, ["recitation.mp4"])
    }

    func testSharedLinkInboxOpensImportWorkflow() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "group.app.ayahclip.mobile"))
        defaults.set("https://www.tiktok.com/@ayahclip/video/123", forKey: "pendingSharedLink")
        defer {
            defaults.removeObject(forKey: "pendingSharedLink")
            UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1")
        }

        let model = AppModel()
        await model.consumeSharedInbox()

        XCTAssertEqual(model.selectedTab, .import)
        XCTAssertEqual(model.pendingLink, "https://www.tiktok.com/@ayahclip/video/123")
        XCTAssertEqual(
            model.notice,
            "Reference saved on this iPhone. Import the original file you own from Photos or Files to edit it."
        )
        XCTAssertNil(defaults.string(forKey: "pendingSharedLink"))
        XCTAssertEqual(
            UserDefaults.standard.string(forKey: "ayahclip.lastReference.v1"),
            "https://www.tiktok.com/@ayahclip/video/123"
        )
    }

    func testSupportedSocialReferencesAreNormalizedAndPersisted() throws {
        UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1")
        defer { UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1") }
        let references = [
            " https://vm.tiktok.com/ZM123/#watch ",
            "https://www.instagram.com/reel/ABC123/",
            "https://youtube.com/shorts/xyz789?feature=share",
            "https://youtu.be/xyz789"
        ]

        for reference in references {
            let model = AppModel()
            model.pendingLink = reference
            XCTAssertTrue(model.referenceLink(), reference)
            XCTAssertFalse(model.pendingLink.contains("#"), reference)
            XCTAssertEqual(
                UserDefaults.standard.string(forKey: "ayahclip.lastReference.v1"),
                model.pendingLink
            )
        }
        XCTAssertEqual(AppModel().pendingLink, "https://youtu.be/xyz789")
    }

    func testReferenceValidationRejectsUnsafeOrUnsupportedURLs() {
        UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1")
        defer { UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1") }
        for reference in [
            "ftp://tiktok.com/video/123",
            "https://tiktok.com.evil.example/video/123",
            "https://user:password@youtube.com/shorts/123",
            "https://example.com/video/123",
            String(repeating: "a", count: 2_049)
        ] {
            let model = AppModel()
            model.pendingLink = reference
            XCTAssertFalse(model.referenceLink(), reference)
        }
        XCTAssertNil(UserDefaults.standard.string(forKey: "ayahclip.lastReference.v1"))
    }

    func testImportedMediaRetainsSavedSocialReference() async throws {
        UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1")
        defer { UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1") }
        let source = try await makeTestVideo()
        let model = AppModel()
        model.projects = []
        model.activeProject = nil
        model.pendingLink = "https://www.instagram.com/reel/ABC123/"
        XCTAssertTrue(model.referenceLink())

        let imported = await model.importMedia(from: source)
        XCTAssertTrue(imported)
        XCTAssertEqual(
            model.activeProject?.sourceReferenceURL,
            "https://www.instagram.com/reel/ABC123/"
        )

        model.saveActiveProject()
        if let saved = model.projects.first { model.delete(saved) }
        model.activeProject = nil
    }

    func testFailedSharedFileImportRemainsQueuedForRetry() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "group.app.ayahclip.mobile"))
        let filename = "missing-\(UUID().uuidString).mov"
        defaults.set(filename, forKey: "pendingSharedFile")
        defer { defaults.removeObject(forKey: "pendingSharedFile") }

        let model = AppModel()
        await model.consumeSharedInbox()

        XCTAssertEqual(defaults.string(forKey: "pendingSharedFile"), filename)
        XCTAssertNotNil(model.notice)
    }

    func testInvalidSharedTextIsDeliveredOnceForCorrection() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "group.app.ayahclip.mobile"))
        defaults.set("not a social URL", forKey: "pendingSharedLink")
        defer { defaults.removeObject(forKey: "pendingSharedLink") }

        let model = AppModel()
        await model.consumeSharedInbox()

        XCTAssertEqual(model.selectedTab, .import)
        XCTAssertEqual(model.pendingLink, "not a social URL")
        XCTAssertNil(defaults.string(forKey: "pendingSharedLink"))
        XCTAssertEqual(model.notice, "Paste a complete TikTok, Instagram, or YouTube link.")
    }

    func testProjectCanBeDuplicatedAndDeleted() {
        let model = AppModel()
        model.projects = []
        model.createProject()
        model.saveActiveProject()
        let original = try! XCTUnwrap(model.projects.first)

        model.duplicate(original)
        XCTAssertEqual(model.projects.count, 2)
        XCTAssertNotEqual(model.projects[0].id, original.id)
        XCTAssertEqual(model.projects[0].title, "\(original.title) Copy")

        model.delete(original)
        XCTAssertEqual(model.projects.count, 1)
        XCTAssertFalse(model.projects.contains(where: { $0.id == original.id }))
        model.projects.forEach(model.delete)
    }

    private func averageLuminance(image: CGImage, xRange: Range<Int>) -> Double {
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
        context?.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        var total = 0.0
        var count = 0
        for y in 0..<(height / 4) {
            for x in xRange {
                let offset = (y * width + x) * 4
                total += 0.2126 * Double(pixels[offset])
                    + 0.7152 * Double(pixels[offset + 1])
                    + 0.0722 * Double(pixels[offset + 2])
                count += 1
            }
        }
        return total / Double(max(1, count))
    }

    private func averageRGB(image: CGImage) -> (red: Double, green: Double, blue: Double) {
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
        context?.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        var red = 0.0
        var green = 0.0
        var blue = 0.0
        var count = 0.0
        for y in 0..<(height / 4) {
            for x in 0..<width {
                let offset = (y * width + x) * 4
                red += Double(pixels[offset])
                green += Double(pixels[offset + 1])
                blue += Double(pixels[offset + 2])
                count += 1
            }
        }
        return (red / count, green / count, blue / count)
    }

    private func makeTestVideo(
        color: CIColor = CIColor(red: 0.04, green: 0.14, blue: 0.24),
        frameCount: Int = 30
    ) async throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("ayahclip-export-source-\(UUID().uuidString).mp4")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let input = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: 360,
                AVVideoHeightKey: 640
            ]
        )
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: 360,
                kCVPixelBufferHeightKey as String: 640
            ]
        )
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        let context = CIContext()
        let frame = CIImage(color: color)
            .cropped(to: CGRect(x: 0, y: 0, width: 360, height: 640))

        for index in 0..<frameCount {
            while !input.isReadyForMoreMediaData { await Task.yield() }
            var pixelBuffer: CVPixelBuffer?
            CVPixelBufferCreate(
                kCFAllocatorDefault,
                360,
                640,
                kCVPixelFormatType_32BGRA,
                nil,
                &pixelBuffer
            )
            let buffer = try XCTUnwrap(pixelBuffer)
            context.render(frame, to: buffer)
            XCTAssertTrue(adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: 30)))
        }

        input.markAsFinished()
        await writer.finishWriting()
        if writer.status != .completed {
            throw writer.error ?? CocoaError(.fileWriteUnknown)
        }
        return url
    }

    private func makeSilentAudio(duration: Double) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("ayahclip-recitation-\(UUID().uuidString).wav")
        let sampleRate = 44_100.0
        let format = try XCTUnwrap(
            AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)
        )
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        let buffer = try XCTUnwrap(
            AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)
        )
        buffer.frameLength = frameCount
        if let channel = buffer.floatChannelData?.pointee {
            channel.initialize(repeating: 0, count: Int(frameCount))
        }
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try file.write(from: buffer)
        return url
    }
}
