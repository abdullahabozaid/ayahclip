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
        let decoded = try JSONDecoder().decode(
            ClipProject.self,
            from: JSONEncoder().encode(project)
        )
        XCTAssertEqual(decoded.layout, .lowerThird)
        XCTAssertEqual(decoded.captionStyle, .crispOutline)
    }

    func testSharedLinkInboxOpensImportWorkflow() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "group.app.ayahclip.mobile"))
        defaults.set("https://www.tiktok.com/@ayahclip/video/123", forKey: "pendingSharedLink")
        defer { defaults.removeObject(forKey: "pendingSharedLink") }

        let model = AppModel()
        await model.consumeSharedInbox()

        XCTAssertEqual(model.selectedTab, .import)
        XCTAssertEqual(model.pendingLink, "https://www.tiktok.com/@ayahclip/video/123")
        XCTAssertEqual(
            model.notice,
            "Link saved as a reference. Import the original file you own from Photos or Files to edit it."
        )
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

    private func makeTestVideo() async throws -> URL {
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
        let frame = CIImage(color: CIColor(red: 0.04, green: 0.14, blue: 0.24))
            .cropped(to: CGRect(x: 0, y: 0, width: 360, height: 640))

        for index in 0..<30 {
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
}
