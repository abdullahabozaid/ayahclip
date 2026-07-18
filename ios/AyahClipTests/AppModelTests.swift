import AVFoundation
import CoreImage
import UIKit
import XCTest
@testable import AyahClip

@MainActor
final class AppModelTests: XCTestCase {
    func testNativeMediaImportCoordinatorCompletesOneValidatedPickerRequest() async throws {
        let coordinator = NativeMediaImportCoordinator()
        let payload = MobileMediaImportRequestPayload(
            kinds: [.image, .video],
            maxCount: 2,
            purpose: .broll
        )
        let task = Task { try await coordinator.request(payload) }
        await Task.yield()

        XCTAssertEqual(coordinator.pendingRequest?.payload, payload)
        XCTAssertEqual(
            NativeMediaImportCoordinator.allowedContentTypes(for: payload),
            [.image, .movie]
        )
        let urls = [
            URL(fileURLWithPath: "/tmp/owned-photo.jpg"),
            URL(fileURLWithPath: "/tmp/owned-video.mov")
        ]
        coordinator.complete(with: urls)

        let selected = try await task.value
        XCTAssertEqual(selected, urls)
        XCTAssertNil(coordinator.pendingRequest)
    }

    func testNativeMediaImportCoordinatorRejectsWrongTypeAndResumesOnce() async {
        let coordinator = NativeMediaImportCoordinator()
        let payload = MobileMediaImportRequestPayload(
            kinds: [.image],
            maxCount: 1,
            purpose: .replacement
        )
        let task = Task { try await coordinator.request(payload) }
        await Task.yield()
        coordinator.complete(with: [URL(fileURLWithPath: "/tmp/recitation.mp3")])
        coordinator.cancel()

        do {
            _ = try await task.value
            XCTFail("A mismatched picker result must be rejected")
        } catch {
            XCTAssertEqual(error as? NativeMediaImportCoordinator.ImportError, .invalidSelection)
        }
        XCTAssertNil(coordinator.pendingRequest)
    }

    func testBrollImportDoesNotBecomePrimaryMediaInAnEmptyReciterProject() async throws {
        let model = AppModel()
        model.createProject()
        defer {
            model.closeEditor()
            model.projects.forEach(model.delete)
        }
        let source = FileManager.default.temporaryDirectory
            .appendingPathComponent("broll-\(UUID().uuidString).jpg")
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        try XCTUnwrap(image.jpegData(compressionQuality: 0.8)).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        let imported = await model.importMedia(from: [source], placement: .additional)
        XCTAssertTrue(imported)
        XCTAssertNil(model.activeProject?.mediaFilename)
        XCTAssertEqual(model.activeProject?.bRollFilenames?.count, 1)
        XCTAssertEqual(model.importedMediaURLs.count, 1)
    }

    func testFreshDraftContainsNoPrototypeQuranPassage() {
        let draft = ClipProject.freshDraft()

        XCTAssertEqual(draft.title, "Untitled Quran clip")
        XCTAssertNil(draft.surahID)
        XCTAssertNil(draft.selectedVerseNumbers)
        XCTAssertTrue(draft.segments.isEmpty)
        XCTAssertTrue(draft.arabic.isEmpty)
        XCTAssertTrue(draft.translation.isEmpty)
        let snapshot = MobileProjectSnapshotV1(project: draft, media: [])
        XCTAssertTrue(snapshot.isValid)
        XCTAssertNil(snapshot.quran)
        XCTAssertTrue(snapshot.segments.isEmpty)
    }

    func testMobileEditorHostSessionOwnsBridgeAndPickerLifetime() throws {
        let model = AppModel()
        model.createProject()
        let host = try MobileEditorHostSession(model: model)

        XCTAssertEqual(host.environment.editorURL.path, "/import")
        XCTAssertNil(host.mediaImports.pendingRequest)
        let webView = host.makeWebView()
        XCTAssertTrue(webView === host.makeWebView())
        XCTAssertNotNil(webView.navigationDelegate)
        XCTAssertEqual(webView.customUserAgent, "AyahClip-iOS/0.1 SharedStudio")
        XCTAssertNotNil(webView.configuration.urlSchemeHandler(
            forURLScheme: NativeMediaSchemeHandler.scheme
        ))
        XCTAssertEqual(webView.url?.host, "ayahclip.com")
        XCTAssertEqual(webView.url?.path, "/import")
        host.close()
        host.close()
        XCTAssertNil(host.webView)
        model.activeProject = nil
    }

    func testWatermarkCleanupZonesStayInsidePortraitVideo() {
        let extent = CGRect(x: 0, y: 0, width: 1080, height: 1920)
        let regions = WatermarkCleanupService.watermarkRegions(in: extent)

        XCTAssertEqual(regions.count, 2)
        XCTAssertTrue(regions.allSatisfy { extent.contains($0) })
        XCTAssertTrue(regions[0].minY > extent.midY)
        XCTAssertTrue(regions[1].maxY < extent.midY)
        XCTAssertFalse(regions[0].intersects(regions[1]))
    }

    func testWatermarkCleanupRejectsEmptyExtent() {
        XCTAssertTrue(WatermarkCleanupService.watermarkRegions(in: .zero).isEmpty)
    }

    func testWatermarkCleanupProducesPlayableLocalMP4() async throws {
        let source = try await makeTestVideo(frameCount: 6)
        defer { try? FileManager.default.removeItem(at: source) }

        let cleaned = try await WatermarkCleanupService.cleanCommonTikTokZones(sourceURL: source)
        defer { try? FileManager.default.removeItem(at: cleaned) }

        let asset = AVURLAsset(url: cleaned)
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let duration = try await asset.load(.duration).seconds
        XCTAssertFalse(videoTracks.isEmpty)
        XCTAssertGreaterThan(duration, 0)
        XCTAssertGreaterThan(
            try cleaned.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0,
            0
        )
    }

    func testLegacyPlaceholderMigrationPreservesCreatorEditedProjects() {
        let untouched = ClipProject.freshStarter()
        XCTAssertTrue(untouched.removingLegacyPlaceholderIfNeeded().segments.isEmpty)

        var edited = untouched
        edited.segments[0].translation = "Creator correction"
        let preserved = edited.removingLegacyPlaceholderIfNeeded()
        XCTAssertEqual(preserved.segments.count, 3)
        XCTAssertEqual(preserved.segments[0].translation, "Creator correction")
    }

    @MainActor
    func testChunkedSharedStudioExportReassemblesExactVideoBytes() throws {
        let bytes = Data((0..<(MobileExportTransferSession.chunkSize + 37)).map {
            UInt8($0 % 251)
        })
        let session = MobileExportTransferSession()
        let ready = try session.begin(MobileExportRequestPayload(
            fileName: "ayahclip-test.mp4",
            mimeType: "video/mp4",
            fileSize: Int64(bytes.count),
            totalChunks: 2
        ))
        let first = bytes.prefix(MobileExportTransferSession.chunkSize)
        let second = bytes.dropFirst(MobileExportTransferSession.chunkSize)
        try session.append(MobileExportChunkPayload(
            exportId: ready.exportId,
            index: 0,
            totalChunks: 2,
            base64Data: Data(first).base64EncodedString()
        ))
        try session.append(MobileExportChunkPayload(
            exportId: ready.exportId,
            index: 1,
            totalChunks: 2,
            base64Data: Data(second).base64EncodedString()
        ))

        let (url, completed) = try session.complete(MobileExportControlPayload(
            exportId: ready.exportId,
            totalChunks: 2
        ))
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertEqual(completed.status, .complete)
        XCTAssertEqual(try Data(contentsOf: url), bytes)
    }

    @MainActor
    func testChunkedSharedStudioExportRejectsOutOfOrderDataAndCleansUp() throws {
        let session = MobileExportTransferSession()
        let ready = try session.begin(MobileExportRequestPayload(
            fileName: "ayahclip-test.mp4",
            mimeType: "video/mp4",
            fileSize: 2,
            totalChunks: 1
        ))
        XCTAssertThrowsError(try session.append(MobileExportChunkPayload(
            exportId: ready.exportId,
            index: 1,
            totalChunks: 1,
            base64Data: Data([1, 2]).base64EncodedString()
        )))
        session.close()
    }

    @MainActor
    func testSharedStudioExportMovesToAppAndSavesToPhotos() async throws {
        var savedBytes: Data?
        let model = AppModel(
            photoAuthorizationRequester: { .authorized },
            photoSaver: { url in savedBytes = try Data(contentsOf: url) }
        )
        model.createProject()
        let source = FileManager.default.temporaryDirectory
            .appendingPathComponent("web-export-\(UUID().uuidString).mp4")
        let expected = Data("rendered-mp4".utf8)
        try expected.write(to: source)

        try await model.receiveMobileEditorExport(source)

        XCTAssertEqual(savedBytes, expected)
        XCTAssertEqual(model.notice, "Video saved to Photos.")
        XCTAssertFalse(FileManager.default.fileExists(atPath: source.path))
        if let output = model.exportURL { try? FileManager.default.removeItem(at: output) }
        model.activeProject = nil
    }

    @MainActor
    func testSharedImageProviderMaterializesAFileForTheExtensionInbox() async throws {
        let source = FileManager.default.temporaryDirectory
            .appendingPathComponent("shared-\(UUID().uuidString).jpg")
        defer { try? FileManager.default.removeItem(at: source) }
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        try XCTUnwrap(image.jpegData(compressionQuality: 0.9)).write(to: source)
        let provider = try XCTUnwrap(NSItemProvider(contentsOf: source))

        let materialized = try await SharedMediaProviderLoader.loadFile(
            from: provider,
            type: .image
        )
        defer { try? FileManager.default.removeItem(at: materialized) }

        XCTAssertTrue(FileManager.default.fileExists(atPath: materialized.path))
        XCTAssertNotNil(UIImage(contentsOfFile: materialized.path))
    }

    func testSharedImportPolicyMatchesEditorLimits() throws {
        XCTAssertEqual(MediaImportPolicy.maxMediaCount, 8)
        XCTAssertNoThrow(try MediaImportPolicy.validateBatch(attachedCount: 6, incomingCount: 2))
        XCTAssertThrowsError(try MediaImportPolicy.validateBatch(attachedCount: 7, incomingCount: 2))
        XCTAssertNoThrow(try MediaImportPolicy.validateFile(
            fileBytes: 4 * 1_024 * 1_024 * 1_024,
            availableBytes: 6 * 1_024 * 1_024 * 1_024
        ))
        XCTAssertThrowsError(try MediaImportPolicy.validateFile(
            fileBytes: 4 * 1_024 * 1_024 * 1_024 + 1,
            availableBytes: 8 * 1_024 * 1_024 * 1_024
        ))
        XCTAssertThrowsError(try MediaImportPolicy.validateFile(
            fileBytes: 2 * 1_024 * 1_024 * 1_024,
            availableBytes: 2 * 1_024 * 1_024 * 1_024
        ))
    }

    func testStarterProjectHasOrderedVerseSegments() {
        let segments = ClipProject.starter.segments
        XCTAssertEqual(segments.map(\.verse), [1, 2, 3])
        XCTAssertTrue(zip(segments, segments.dropFirst()).allSatisfy { $0.end <= $1.start })
    }

    func testQuranRangeReplacesHardCodedStarterContentTransactionally() throws {
        let chapter = QuranChapter(
            id: 93,
            nameSimple: "Ad-Duhaa",
            nameArabic: "الضحى",
            versesCount: 11,
            revelationPlace: "makkah",
            translatedName: .init(name: "The Morning Hours", languageName: "english")
        )
        let verses = [
            QuranCatalogVerse(
                id: 1,
                verseNumber: 3,
                verseKey: "93:3",
                textUthmani: "مَا وَدَّعَكَ رَبُّكَ وَمَا قَلَىٰ",
                translations: [.init(text: "Your Lord has not abandoned you, nor has He become hateful.")]
            ),
            QuranCatalogVerse(
                id: 2,
                verseNumber: 4,
                verseKey: "93:4",
                textUthmani: "وَلَلْـَٔاخِرَةُ خَيْرٌ لَّكَ مِنَ ٱلْأُولَىٰ",
                translations: [.init(text: "And the next life is certainly far better for you than this one.")]
            )
        ]
        var project = ClipProject.freshStarter()

        project.applyQuranRange(chapter: chapter, verses: verses)

        XCTAssertEqual(project.surahID, 93)
        XCTAssertEqual(project.surahName, "Surah Ad-Duhaa")
        XCTAssertEqual(project.verseRange, "Verses 3-4")
        XCTAssertEqual(project.selectedVerseNumbers, [3, 4])
        XCTAssertEqual(project.segments.map(\.verse), [3, 4])
        XCTAssertEqual(project.segments.first?.arabic, verses[0].textUthmani)
        XCTAssertEqual(project.segments.last?.translation, verses[1].cleanTranslation)
        XCTAssertEqual(try XCTUnwrap(project.segments.last?.end), 16, accuracy: 0.001)
    }

    func testQuranCatalogDecodesVerifiedChapterVerseOrderAndCleansFootnotes() async throws {
        let payload = #"{"verses":[{"id":10,"verse_number":1,"verse_key":"1:1","text_uthmani":"بِسْمِ ٱللَّهِ","translations":[{"text":"In the name of Allah<sup foot_note=\"1\">1</sup>"}]},{"id":11,"verse_number":2,"verse_key":"1:2","text_uthmani":"ٱلْحَمْدُ لِلَّهِ","translations":[{"text":"All praise is for Allah"}]}]}"#.data(using: .utf8)!
        let service = QuranCatalogService { url in
            XCTAssertEqual(url.scheme, "https")
            XCTAssertEqual(url.host, "api.quran.com")
            XCTAssertTrue(url.path.hasSuffix("/verses/by_chapter/1"))
            return payload
        }

        let verses = try await service.fetchVerses(chapter: 1)

        XCTAssertEqual(verses.map(\.verseNumber), [1, 2])
        XCTAssertEqual(verses[0].cleanTranslation, "In the name of Allah")
        XCTAssertEqual(verses[1].verseKey, "1:2")
    }

    func testQuranCatalogRejectsOutOfRangeChapterBeforeNetworking() async {
        let service = QuranCatalogService { _ in
            XCTFail("An invalid chapter must not reach the network")
            return Data()
        }

        do {
            _ = try await service.fetchVerses(chapter: 115)
            XCTFail("Expected invalid chapter error")
        } catch let error as QuranCatalogService.CatalogError {
            XCTAssertEqual(error.localizedDescription, "Surah 115 is outside the Quran's 1 to 114 range.")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testAppModelLoadsAndAppliesCreatorChosenVerseRange() async throws {
        let chapters = (1...114).map { id in
            [
                "id": id,
                "name_simple": id == 93 ? "Ad-Duhaa" : "Surah \(id)",
                "name_arabic": "سورة",
                "verses_count": id == 93 ? 11 : 1,
                "revelation_place": "makkah",
                "translated_name": ["name": "Chapter", "language_name": "english"]
            ] as [String: Any]
        }
        let chapterData = try JSONSerialization.data(withJSONObject: ["chapters": chapters])
        let verseData = #"{"verses":[{"id":1,"verse_number":1,"verse_key":"93:1","text_uthmani":"وَٱلضُّحَىٰ","translations":[{"text":"By the morning sunlight"}]},{"id":2,"verse_number":2,"verse_key":"93:2","text_uthmani":"وَٱلَّيْلِ إِذَا سَجَىٰ","translations":[{"text":"and the night when it falls still"}]}]}"#.data(using: .utf8)!
        let service = QuranCatalogService { url in
            url.path.contains("verses/by_chapter") ? verseData : chapterData
        }
        let model = AppModel(quranCatalog: service)
        model.projects = []
        model.activeProject = nil

        await model.loadQuranChapters()
        await model.loadQuranVerses(chapter: 93)
        let applied = model.applyQuranRange(chapterID: 93, from: 1, to: 2)

        XCTAssertTrue(applied)
        XCTAssertEqual(model.quranChapters.count, 114)
        XCTAssertEqual(model.activeProject?.surahID, 93)
        XCTAssertEqual(model.activeProject?.selectedVerseNumbers, [1, 2])
        XCTAssertEqual(model.activeProject?.segments.map(\.verse), [1, 2])
        model.activeProject = nil
    }

    func testMobileEditorBridgeIsVersionedAndOriginLocked() throws {
        let projectID = UUID()
        let url = MobileEditorBridgeContract.editorURL(projectID: projectID)
        let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))

        XCTAssertEqual(url.host, "ayahclip.com")
        XCTAssertEqual(url.path, "/studio")
        XCTAssertEqual(
            MobileEditorBridgeContract.editorURL(
                projectID: projectID,
                requiresPassageSelection: true
            ).path,
            "/import"
        )
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "bridge" })?.value, "1")
        XCTAssertEqual(
            components.queryItems?.first(where: { $0.name == "project" })?.value,
            projectID.uuidString
        )
        XCTAssertTrue(MobileEditorBridgeContract.allowsNavigation(to: url))
        XCTAssertFalse(MobileEditorBridgeContract.allowsNavigation(
            to: try XCTUnwrap(URL(string: "https://ayahclip.com.evil.example/studio"))
        ))
        XCTAssertFalse(MobileEditorBridgeContract.allowsNavigation(
            to: try XCTUnwrap(URL(string: "http://ayahclip.com/studio"))
        ))
        XCTAssertTrue(MobileEditorBridgeContract.allowsNavigation(
            to: try XCTUnwrap(URL(string: "https://ayahclip.com/privacy"))
        ))
        XCTAssertEqual(MobileEditorBridgeContract.productURL().path, "")
        XCTAssertEqual(
            URLComponents(
                url: MobileEditorBridgeContract.productURL(),
                resolvingAgainstBaseURL: false
            )?.queryItems?.first(where: { $0.name == "app" })?.value,
            "ios"
        )
        let socialSource = "https://www.tiktok.com/@ayahclip/video/123"
        let socialProductURL = MobileEditorBridgeContract.productURL(
            sourceReferenceURL: socialSource
        )
        let socialComponents = try XCTUnwrap(URLComponents(
            url: socialProductURL,
            resolvingAgainstBaseURL: false
        ))
        XCTAssertEqual(socialProductURL.path, "/import")
        XCTAssertEqual(
            socialComponents.queryItems?.first(where: { $0.name == "social" })?.value,
            socialSource
        )
    }

    func testMobileDetectionEnvelopeRoundTripsWithoutLosingReviewState() throws {
        let payload = MobileDetectionResultPayload(
            surahId: 93,
            ayahStart: 1,
            ayahEnd: 4,
            confidence: .medium,
            reviewVerseNumbers: [3, 4],
            alternatives: [
                .init(surahId: 94, ayahStart: 1, ayahEnd: 3, confidence: 0.71)
            ]
        )
        let envelope = MobileBridgeEnvelope(
            id: "detection-1",
            type: .detectionResult,
            payload: payload
        )

        let encoded = try JSONEncoder().encode(envelope)
        let decoded = try JSONDecoder().decode(
            MobileBridgeEnvelope<MobileDetectionResultPayload>.self,
            from: encoded
        )

        XCTAssertTrue(decoded.isSupported)
        XCTAssertEqual(decoded, envelope)
        XCTAssertEqual(decoded.payload.reviewVerseNumbers, [3, 4])
        XCTAssertEqual(decoded.payload.alternatives.first?.surahId, 94)
    }

    func testNativeMediaRegistryHidesPathsAndServesExactByteRanges() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ayahclip-native-media-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("owned.mp4")
        let bytes = Data((0..<100).map(UInt8.init))
        try bytes.write(to: source)
        let registry = NativeMediaRegistry(allowedRoots: [root])

        let descriptor = try registry.register(source)
        let handle = try XCTUnwrap(NativeMediaRegistry.handle(from: descriptor.url))

        XCTAssertFalse(descriptor.url.absoluteString.contains(root.path))
        XCTAssertEqual(descriptor.fileSize, 100)
        XCTAssertEqual(descriptor.contentType, "video/mp4")

        let bounded = try registry.responsePlan(handle: handle, rangeHeader: "bytes=10-19")
        XCTAssertEqual(bounded.statusCode, 206)
        XCTAssertEqual(bounded.offset, 10)
        XCTAssertEqual(bounded.length, 10)
        XCTAssertEqual(bounded.headers["Content-Range"], "bytes 10-19/100")
        XCTAssertEqual(
            try registry.read(handle: handle, plan: bounded),
            Data((10..<20).map(UInt8.init))
        )

        let openEnded = try registry.responsePlan(handle: handle, rangeHeader: "bytes=95-")
        XCTAssertEqual(
            try registry.read(handle: handle, plan: openEnded),
            Data((95..<100).map(UInt8.init))
        )

        let suffix = try registry.responsePlan(handle: handle, rangeHeader: "bytes=-4")
        XCTAssertEqual(
            try registry.read(handle: handle, plan: suffix),
            Data((96..<100).map(UInt8.init))
        )

        var chunks: [Data] = []
        let full = try registry.responsePlan(handle: handle, rangeHeader: nil)
        try registry.stream(handle: handle, plan: full, chunkSize: 16) { chunks.append($0) }
        XCTAssertEqual(chunks.count, 7)
        XCTAssertEqual(chunks.reduce(into: Data(), { $0.append($1) }), bytes)
    }

    func testNativeMediaRegistryRejectsTraversalUnknownHandlesAndInvalidRanges() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ayahclip-native-root-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let inside = root.appendingPathComponent("inside.png")
        try Data(repeating: 1, count: 20).write(to: inside)
        let outside = FileManager.default.temporaryDirectory
            .appendingPathComponent("outside-\(UUID().uuidString).png")
        try Data(repeating: 2, count: 20).write(to: outside)
        defer { try? FileManager.default.removeItem(at: outside) }
        let registry = NativeMediaRegistry(allowedRoots: [root])

        XCTAssertThrowsError(try registry.register(outside))
        let descriptor = try registry.register(inside)
        let handle = try XCTUnwrap(NativeMediaRegistry.handle(from: descriptor.url))
        XCTAssertThrowsError(try registry.responsePlan(handle: "unknown", rangeHeader: nil))
        XCTAssertThrowsError(try registry.responsePlan(handle: handle, rangeHeader: "bytes=50-60"))
        XCTAssertThrowsError(try registry.responsePlan(handle: handle, rangeHeader: "bytes=1-2,4-5"))

        registry.revokeAll()
        XCTAssertThrowsError(try registry.responsePlan(handle: handle, rangeHeader: nil))
    }

    func testSharedProjectSnapshotCarriesQuranStyleTimingAndOpaqueMedia() throws {
        var project = ClipProject.freshStarter()
        project.surahID = 67
        project.selectedVerseNumbers = [1, 2, 3]
        project.reciterID = "alafasy"
        project.layout = .sideFade
        project.captionStyle = .softGlow
        let media = NativeMediaDescriptor(
            id: "opaque-handle",
            url: try XCTUnwrap(URL(string: "ayahclip-media://asset/opaque-handle")),
            contentType: "video/mp4",
            fileSize: 1_024
        )

        let snapshot = MobileProjectSnapshotV1(project: project, media: [media])
        let encoded = try JSONEncoder().encode(snapshot)
        let decoded = try JSONDecoder().decode(MobileProjectSnapshotV1.self, from: encoded)

        XCTAssertTrue(decoded.isValid)
        XCTAssertEqual(decoded.id, project.id.uuidString)
        XCTAssertEqual(decoded.quran?.surahId, 67)
        XCTAssertEqual(decoded.quran?.verseNumbers, [1, 2, 3])
        XCTAssertEqual(decoded.quran?.reciterId, "alafasy")
        XCTAssertEqual(decoded.style.layout, "sideFade")
        XCTAssertEqual(decoded.style.captionStyle, "softGlow")
        XCTAssertEqual(decoded.segments.map(\.verseNumber), [1, 2, 3])
        XCTAssertEqual(decoded.media, [media])
        XCTAssertFalse(String(decoding: encoded, as: UTF8.self).contains("/private/"))
    }

    func testMobileEditorSessionHydratesThenRevokesPrivateMedia() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let mediaURL = root.appendingPathComponent("recitation.mp4")
        try Data("private-media".utf8).write(to: mediaURL)

        var project = ClipProject.freshStarter()
        project.mediaFilename = mediaURL.lastPathComponent
        let registry = NativeMediaRegistry(allowedRoots: [root])
        let session = MobileEditorSession(registry: registry)

        let envelope = try session.prepare(project: project, mediaURLs: [mediaURL])

        XCTAssertEqual(envelope.type, MobileBridgeMessageType.hydrateProject)
        XCTAssertTrue(envelope.isSupported)
        XCTAssertTrue(envelope.payload.isValid)
        XCTAssertEqual(envelope.payload.media.count, 1)
        XCTAssertEqual(envelope.payload.media[0].url.scheme, "ayahclip-media")
        XCTAssertFalse(envelope.payload.media[0].url.absoluteString.contains(root.path))

        let handle = try XCTUnwrap(NativeMediaRegistry.handle(from: envelope.payload.media[0].url))
        XCTAssertEqual(try registry.responsePlan(handle: handle, rangeHeader: nil).statusCode, 200)

        session.close()
        XCTAssertThrowsError(try registry.responsePlan(handle: handle, rangeHeader: nil))
    }

    func testMobileEditorSessionRegistersDurableTemplateMediaWithoutReplacingExistingHandles() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let recitation = root.appendingPathComponent("recitation.mp4")
        let broll = root.appendingPathComponent("broll.jpg")
        try Data("private-media".utf8).write(to: recitation)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.black.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
        try XCTUnwrap(image.jpegData(compressionQuality: 0.8)).write(to: broll)
        var project = ClipProject.freshStarter()
        project.mediaFilename = recitation.lastPathComponent
        let registry = NativeMediaRegistry(allowedRoots: [root])
        let session = MobileEditorSession(registry: registry)
        let hydrated = try session.prepare(project: project, mediaURLs: [recitation])
        let originalHandle = hydrated.payload.media[0].id

        let added = try session.registerAdditionalMedia([broll])

        XCTAssertEqual(added.count, 1)
        XCTAssertEqual(try registry.responsePlan(handle: originalHandle, rangeHeader: nil).statusCode, 200)
        XCTAssertEqual(try registry.responsePlan(handle: added[0].id, rangeHeader: nil).headers["Content-Type"], "image/jpeg")
        session.close()
        XCTAssertThrowsError(try registry.responsePlan(handle: added[0].id, rangeHeader: nil))
    }

    func testMobileEditorSessionRejectsMismatchedMediaWithoutLeavingHandles() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let mediaURL = root.appendingPathComponent("recitation.mp4")
        try Data("private-media".utf8).write(to: mediaURL)
        let registry = NativeMediaRegistry(allowedRoots: [root])
        let session = MobileEditorSession(registry: registry)

        XCTAssertThrowsError(
            try session.prepare(project: ClipProject.freshStarter(), mediaURLs: [mediaURL])
        )
    }

    func testMobileEditorSessionAppliesValidatedWebEditsWithoutChangingNativeMedia() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let mediaURL = root.appendingPathComponent("recitation.mp4")
        try Data("private-media".utf8).write(to: mediaURL)

        var project = ClipProject.freshStarter()
        project.mediaFilename = mediaURL.lastPathComponent
        project.surahID = 67
        project.selectedVerseNumbers = [1, 2, 3]
        let registry = NativeMediaRegistry(allowedRoots: [root])
        let session = MobileEditorSession(registry: registry)
        let hydrated = try session.prepare(project: project, mediaURLs: [mediaURL])

        var webProject = project
        webProject.title = "Al-Mulk review"
        webProject.layout = .sideFade
        webProject.captionStyle = .gold
        webProject.arabicSize = 42
        webProject.overlayOpacity = 0.48
        webProject.webEditorDocumentJSON = """
        {"schemaVersion":1,"projectId":"\(project.id.uuidString)","project":{"settings":{"clipFadeMs":400,"backgroundSequenceEnabled":true,"textLayout":"left-panel"}}}
        """
        let changed = MobileBridgeEnvelope(
            type: MobileBridgeMessageType.projectChanged,
            payload: MobileProjectSnapshotV1(project: webProject, media: hydrated.payload.media)
        )

        let applied = try session.applyProjectChange(changed, to: project)

        XCTAssertEqual(applied.title, "Al-Mulk review")
        XCTAssertEqual(applied.layout, .sideFade)
        XCTAssertEqual(applied.captionStyle, .gold)
        XCTAssertEqual(applied.arabicSize, 42)
        XCTAssertEqual(applied.overlayOpacity, 0.48)
        XCTAssertEqual(applied.mediaFilename, project.mediaFilename)
        XCTAssertEqual(applied.sourceReferenceURL, project.sourceReferenceURL)
        XCTAssertEqual(applied.webEditorDocumentJSON, webProject.webEditorDocumentJSON)
    }

    func testSharedProjectRejectsEphemeralOrMismatchedEditorDocuments() {
        var project = ClipProject.freshStarter()
        project.webEditorDocumentJSON = """
        {"schemaVersion":1,"projectId":"\(project.id.uuidString)","project":{"settings":{"background":{"type":"video","value":"ayahclip-native-ref://media/0"}}}}
        """
        XCTAssertTrue(MobileProjectSnapshotV1(project: project, media: []).isValid)

        project.webEditorDocumentJSON = """
        {"schemaVersion":1,"projectId":"00000000-0000-4000-8000-000000000000","project":{}}
        """
        XCTAssertFalse(MobileProjectSnapshotV1(project: project, media: []).isValid)

        project.webEditorDocumentJSON = """
        {"schemaVersion":1,"projectId":"\(project.id.uuidString)","project":{"background":"blob:https://ayahclip.com/temporary"}}
        """
        XCTAssertFalse(MobileProjectSnapshotV1(project: project, media: []).isValid)
    }

    func testMobileEditorSessionRejectsWebMediaReplacement() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let mediaURL = root.appendingPathComponent("recitation.mp4")
        try Data("private-media".utf8).write(to: mediaURL)

        var project = ClipProject.freshStarter()
        project.mediaFilename = mediaURL.lastPathComponent
        let registry = NativeMediaRegistry(allowedRoots: [root])
        let session = MobileEditorSession(registry: registry)
        _ = try session.prepare(project: project, mediaURLs: [mediaURL])
        let replacement = NativeMediaDescriptor(
            id: "replacement",
            url: try XCTUnwrap(URL(string: "ayahclip-media://asset/replacement")),
            contentType: "video/mp4",
            fileSize: 10
        )
        let changed = MobileBridgeEnvelope(
            type: MobileBridgeMessageType.projectChanged,
            payload: MobileProjectSnapshotV1(project: project, media: [replacement])
        )

        XCTAssertThrowsError(try session.applyProjectChange(changed, to: project)) { error in
            XCTAssertEqual(error as? MobileEditorSession.SessionError, .mediaMutation)
        }
    }

    func testAppModelAcceptsSharedStudioCheckpointWithoutAddingNativeUndoStep() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let mediaURL = root.appendingPathComponent("recitation.mp4")
        try Data("private-media".utf8).write(to: mediaURL)

        let model = AppModel()
        var project = ClipProject.freshStarter()
        project.mediaFilename = mediaURL.lastPathComponent
        project.surahID = 67
        project.selectedVerseNumbers = [1, 2, 3]
        model.activeProject = project
        let session = MobileEditorSession(
            registry: NativeMediaRegistry(allowedRoots: [root])
        )
        let hydrated = try session.prepare(project: project, mediaURLs: [mediaURL])
        var edited = project
        edited.title = "Saved from shared Studio"
        let envelope = MobileBridgeEnvelope(
            type: MobileBridgeMessageType.projectChanged,
            payload: MobileProjectSnapshotV1(project: edited, media: hydrated.payload.media)
        )

        try model.applyMobileEditorChange(envelope, session: session)

        XCTAssertEqual(model.activeProject?.title, "Saved from shared Studio")
        XCTAssertFalse(model.canUndo)
    }

    func testMobileEditorEnvironmentInstallsCompleteBridgeAndClosesHandles() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let mediaURL = root.appendingPathComponent("recitation.mp4")
        try Data("private-media".utf8).write(to: mediaURL)
        var project = ClipProject.freshStarter()
        project.mediaFilename = mediaURL.lastPathComponent

        let environment = try MobileEditorEnvironment(
            project: project,
            mediaURLs: [mediaURL],
            onProjectChange: { _, _ in }
        )

        XCTAssertTrue(MobileEditorBridgeContract.allowsNavigation(to: environment.editorURL))
        XCTAssertEqual(environment.editorURL.path, "/import")
        XCTAssertEqual(environment.hydrateEnvelope.type, .hydrateProject)
        XCTAssertNotNil(environment.configuration.urlSchemeHandler(
            forURLScheme: NativeMediaSchemeHandler.scheme
        ))
        let handle = try XCTUnwrap(NativeMediaRegistry.handle(
            from: environment.hydrateEnvelope.payload.media[0].url
        ))
        XCTAssertTrue(environment.hasActiveMediaHandle(handle))
        environment.close()
        XCTAssertFalse(environment.hasActiveMediaHandle(handle))
    }

    func testAppModelBuildsSharedEditorEnvironmentForUnselectedImport() throws {
        let model = AppModel()
        model.createProject()
        let environment = try model.makeMobileEditorEnvironment()
        defer {
            environment.close()
            model.activeProject = nil
        }

        XCTAssertEqual(environment.editorURL.path, "/import")
        XCTAssertEqual(environment.hydrateEnvelope.payload.id, model.activeProject?.id.uuidString)
    }

    func testMobileEditorNavigationPolicyConfinesTopLevelProductToAyahClip() {
        XCTAssertTrue(MobileEditorNavigationPolicy.allows(
            url: URL(string: "https://ayahclip.com/studio?native=ios&bridge=1"),
            isMainFrame: true
        ))
        XCTAssertTrue(MobileEditorNavigationPolicy.allows(
            url: URL(string: "https://www.ayahclip.com/studio/project"),
            isMainFrame: true
        ))
        XCTAssertTrue(MobileEditorNavigationPolicy.allows(
            url: URL(string: "https://ayahclip.com/import"),
            isMainFrame: true
        ))
        XCTAssertTrue(MobileEditorNavigationPolicy.allows(
            url: URL(string: "https://ayahclip.com/styles"),
            isMainFrame: true
        ))
        XCTAssertFalse(MobileEditorNavigationPolicy.allows(
            url: URL(string: "https://evil.example/studio"),
            isMainFrame: true
        ))
        XCTAssertFalse(MobileEditorNavigationPolicy.allows(
            url: URL(string: "https://ayahclip.com/studio"),
            isMainFrame: false
        ))
    }

    func testMobileEditorMessageHandlerAcceptsOnlyBoundedJsonObjects() throws {
        let valid: [String: Any] = [
            "protocolVersion": 1,
            "id": "ready-1",
            "type": "ready",
            "payload": ["rendererVersion": "web-1", "capabilities": ["timeline"]]
        ]
        let data = try MobileEditorMessageHandler.messageData(from: valid)
        XCTAssertLessThan(data.count, MobileEditorMessageHandler.maxMessageBytes)
        XCTAssertThrowsError(try MobileEditorMessageHandler.messageData(from: "not-an-object"))

        let oversized: [String: Any] = [
            "payload": String(repeating: "x", count: MobileEditorMessageHandler.maxMessageBytes)
        ]
        XCTAssertThrowsError(try MobileEditorMessageHandler.messageData(from: oversized)) { error in
            XCTAssertEqual(
                error as? MobileEditorMessageHandler.MessageError,
                .oversizedMessage
            )
        }
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
        XCTAssertTrue(model.canUndo)
        XCTAssertFalse(model.canRedo)

        model.undo()
        XCTAssertEqual(model.activeProject?.arabicSize, original)
        XCTAssertFalse(model.canUndo)
        XCTAssertTrue(model.canRedo)

        model.redo()
        XCTAssertEqual(model.activeProject?.arabicSize, 48)
        XCTAssertTrue(model.canUndo)
        XCTAssertFalse(model.canRedo)
    }

    func testNewEditClearsRedoAndHistoryDoesNotCrossProjects() {
        let model = AppModel()
        model.createProject()
        model.updateActive { $0.layout = .sideFade }
        model.undo()
        XCTAssertTrue(model.canRedo)

        model.updateActive { $0.captionStyle = .gold }
        XCTAssertFalse(model.canRedo)
        XCTAssertTrue(model.canUndo)

        model.createProject()
        XCTAssertFalse(model.canUndo)
        XCTAssertFalse(model.canRedo)
    }

    func testActiveDraftAutosavesWithoutClosingEditor() async throws {
        let model = AppModel()
        model.projects = []
        model.createProject()
        let projectID = try XCTUnwrap(model.activeProject?.id)
        model.updateActive { $0.title = "Autosaved draft" }

        try await Task.sleep(for: .milliseconds(550))

        let reloaded = AppModel()
        let restored = try XCTUnwrap(reloaded.projects.first(where: { $0.id == projectID }))
        XCTAssertEqual(restored.title, "Autosaved draft")
        reloaded.delete(restored)
        model.activeProject = nil
    }

    func testMediaReorderAndRemovalSupportUndoRedo() async throws {
        let firstSource = try await makeTestVideo(frameCount: 12)
        let secondSource = try await makeTestVideo(frameCount: 12)
        let model = AppModel()
        model.projects = []
        model.activeProject = nil

        let imported = await model.importMedia(from: [firstSource, secondSource])
        XCTAssertTrue(imported)
        let originalOrder = try XCTUnwrap(model.activeProject?.allMediaFilenames)
        XCTAssertEqual(originalOrder.count, 2)

        await model.moveMedia(from: 1, to: 0)
        XCTAssertEqual(model.activeProject?.allMediaFilenames, Array(originalOrder.reversed()))
        model.undo()
        XCTAssertEqual(model.activeProject?.allMediaFilenames, originalOrder)
        model.redo()
        XCTAssertEqual(model.activeProject?.allMediaFilenames, Array(originalOrder.reversed()))

        let removedFilename = try XCTUnwrap(model.activeProject?.allMediaFilenames.first)
        let removedURL = try XCTUnwrap(model.mediaURL(for: removedFilename))
        await model.removeMedia(at: 0)
        XCTAssertEqual(model.activeProject?.allMediaFilenames.count, 1)
        XCTAssertTrue(FileManager.default.fileExists(atPath: removedURL.path))
        model.undo()
        XCTAssertEqual(model.activeProject?.allMediaFilenames.count, 2)
        XCTAssertTrue(model.importedMediaURLs.contains(removedURL))
        model.redo()
        XCTAssertEqual(model.activeProject?.allMediaFilenames.count, 1)

        model.closeEditor()
        XCTAssertFalse(FileManager.default.fileExists(atPath: removedURL.path))
        model.projects.forEach(model.delete)
    }

    func testImportRejectsMoreThanEightTotalClips() async {
        let model = AppModel()
        model.createProject()
        let sources = (0..<9).map { index in
            FileManager.default.temporaryDirectory.appendingPathComponent("source-\(index).mov")
        }

        let imported = await model.importMedia(from: sources)

        XCTAssertFalse(imported)
        XCTAssertFalse(model.isImporting)
        XCTAssertEqual(
            model.notice,
            "A project can contain up to 8 media clips. Remove a clip before adding more."
        )
        XCTAssertTrue(model.importedMediaURLs.isEmpty)
    }

    func testImportRejectsSourceLargerThanFourGigabytesBeforeCopying() async throws {
        let source = FileManager.default.temporaryDirectory
            .appendingPathComponent("oversized-\(UUID().uuidString).mov")
        XCTAssertTrue(FileManager.default.createFile(atPath: source.path, contents: Data()))
        let handle = try FileHandle(forWritingTo: source)
        try handle.truncate(atOffset: 4 * 1_024 * 1_024 * 1_024 + 1)
        try handle.close()
        defer { try? FileManager.default.removeItem(at: source) }
        let model = AppModel()
        model.createProject()

        let imported = await model.importMedia(from: source)

        XCTAssertFalse(imported)
        XCTAssertEqual(
            model.notice,
            "Could not import that file: That source is larger than the 4 GB per-clip limit. Trim or compress it, then try again."
        )
        XCTAssertTrue(model.importedMediaURLs.isEmpty)
    }

    func testImportRejectsBeforeCopyWhenStorageReserveWouldBeConsumed() async throws {
        let source = try await makeTestVideo(frameCount: 12)
        let model = AppModel(availableCapacityProvider: { _ in
            MediaImportPolicy.storageReserveBytes
        })
        model.createProject()

        let imported = await model.importMedia(from: source)

        XCTAssertFalse(imported)
        XCTAssertEqual(
            model.notice,
            "Could not import that file: This iPhone does not have enough free space to copy that source safely. Free some storage, then try again."
        )
        XCTAssertTrue(model.importedMediaURLs.isEmpty)
    }

    func testNewClipDeepLinkOpensEditor() throws {
        let model = AppModel()
        XCTAssertNil(model.activeProject)

        model.receiveSharedURL(try XCTUnwrap(URL(string: "ayahclip://new")))

        XCTAssertEqual(model.activeProject?.title, "Untitled Quran clip")
        XCTAssertTrue(model.activeProject?.segments.isEmpty == true)
    }

    func testEachNewClipSavesAsAnIndependentProject() throws {
        let model = AppModel()
        model.projects = []

        model.createProject()
        let firstID = try XCTUnwrap(model.activeProject?.id)
        let firstSegmentIDs = try XCTUnwrap(model.activeProject?.segments.map(\.id))
        model.updateActive { $0.title = "First clip" }
        model.saveActiveProject()

        model.createProject()
        let secondID = try XCTUnwrap(model.activeProject?.id)
        let secondSegmentIDs = try XCTUnwrap(model.activeProject?.segments.map(\.id))
        model.updateActive { $0.title = "Second clip" }
        model.saveActiveProject()

        XCTAssertNotEqual(firstID, secondID)
        XCTAssertTrue(Set(firstSegmentIDs).isDisjoint(with: Set(secondSegmentIDs)))
        XCTAssertEqual(model.projects.count, 2)
        XCTAssertEqual(Set(model.projects.map(\.title)), Set(["First clip", "Second clip"]))
        let reloaded = AppModel()
        XCTAssertEqual(reloaded.projects.count, 2)
        XCTAssertEqual(Set(reloaded.projects.map(\.id)), Set([firstID, secondID]))
        reloaded.projects.forEach(reloaded.delete)
        model.activeProject = nil
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

    func testPhotoImportCreatesPlayableVerticalTimelineAndExports() async throws {
        let source = try makeTestImage(color: UIColor(red: 0.04, green: 0.24, blue: 0.42, alpha: 1))
        let model = AppModel()
        model.projects = []
        model.activeProject = nil

        let imported = await model.importMedia(from: source)
        XCTAssertTrue(imported)
        var project = try XCTUnwrap(model.activeProject)
        let storedURL = try XCTUnwrap(model.importedMediaURLs.first)
        project.segments = [VerseSegment(verse: 1, start: 0, end: 1, arabic: "", translation: "")]
        project.setMediaDuration(1, for: storedURL.lastPathComponent)

        let timeline = try await VideoExportService.makeTimelineAsset(
            sourceURLs: [storedURL],
            project: project
        )
        let timelineVideoCount = try await timeline.loadTracks(withMediaType: .video).count
        let timelineDuration = try await timeline.load(.duration).seconds
        XCTAssertEqual(timelineVideoCount, 1)
        XCTAssertEqual(timelineDuration, 1, accuracy: 0.08)

        let output = try await VideoExportService.render(sourceURL: storedURL, project: project)
        let outputAsset = AVURLAsset(url: output)
        let outputTracks = try await outputAsset.loadTracks(withMediaType: .video)
        let track = try XCTUnwrap(outputTracks.first)
        let size = try await track.load(.naturalSize)
        XCTAssertEqual(size.width, VideoExportService.outputSize.width, accuracy: 1)
        XCTAssertEqual(size.height, VideoExportService.outputSize.height, accuracy: 1)
        model.closeEditor()
        model.projects.forEach(model.delete)
    }

    func testPhotoAndRecitationUseAudioDurationRegardlessOfImportOrder() async throws {
        let image = try makeTestImage(color: .systemIndigo)
        let recitation = try makeSilentAudio(duration: 2)
        var project = ClipProject.starter
        project.segments = [VerseSegment(verse: 1, start: 0, end: 2, arabic: "", translation: "")]
        project.setMediaDuration(8, for: image.lastPathComponent)

        let preferred = await VideoExportService.preferredTimelineDuration(
            sourceURLs: [image, recitation],
            project: project
        )
        XCTAssertEqual(try XCTUnwrap(preferred), 2, accuracy: 0.05)

        let timeline = try await VideoExportService.makeTimelineAsset(
            sourceURLs: [image, recitation],
            project: project
        )
        let videoCount = try await timeline.loadTracks(withMediaType: .video).count
        let audioCount = try await timeline.loadTracks(withMediaType: .audio).count
        let duration = try await timeline.load(.duration).seconds
        XCTAssertEqual(videoCount, 1)
        XCTAssertEqual(audioCount, 1)
        XCTAssertEqual(duration, 2, accuracy: 0.08)
    }

    func testActiveExportCanBeCancelledWithoutShowingAnError() async throws {
        let source = try await makeTestVideo(frameCount: 120)
        let model = AppModel()
        model.createProject()
        model.importedMediaURLs = [source]

        model.startExport()
        XCTAssertTrue(model.isExporting)
        model.cancelExport()
        try await Task.sleep(for: .milliseconds(250))

        XCTAssertFalse(model.isExporting)
        XCTAssertNil(model.exportURL)
        XCTAssertNil(model.notice)
    }

    func testOpeningAnotherProjectCannotReceiveStaleExport() async throws {
        let source = try await makeTestVideo(frameCount: 120)
        let model = AppModel()
        model.createProject()
        let exportingProjectID = try XCTUnwrap(model.activeProject?.id)
        model.importedMediaURLs = [source]
        model.startExport()

        model.createProject()
        let replacementProjectID = try XCTUnwrap(model.activeProject?.id)
        try await Task.sleep(for: .milliseconds(350))

        XCTAssertNotEqual(exportingProjectID, replacementProjectID)
        XCTAssertEqual(model.activeProject?.id, replacementProjectID)
        XCTAssertFalse(model.isExporting)
        XCTAssertNil(model.exportURL)
    }

    func testInterruptedExportSurfacesRecoveryWithoutPublishingPartialOutput() async throws {
        struct InterruptedExport: LocalizedError {
            var errorDescription: String? { "Rendering stopped because storage became unavailable." }
        }
        let model = AppModel(exportRenderer: { _, _ in throw InterruptedExport() })
        model.createProject()
        model.importedMediaURLs = [FileManager.default.temporaryDirectory.appendingPathComponent("local-source.mov")]

        model.startExport()
        for _ in 0..<20 {
            guard model.isExporting else { break }
            try await Task.sleep(for: .milliseconds(25))
        }

        XCTAssertFalse(model.isExporting)
        XCTAssertNil(model.exportURL)
        XCTAssertEqual(model.notice, "Export failed: Rendering stopped because storage became unavailable.")
    }

    func testExportRejectsRemoteMediaSoFinishedProjectsRemainOfflineCapable() throws {
        var rendererInvoked = false
        let model = AppModel(exportRenderer: { _, _ in
            rendererInvoked = true
            return FileManager.default.temporaryDirectory.appendingPathComponent("should-not-render.mp4")
        })
        model.createProject()
        model.importedMediaURLs = [try XCTUnwrap(URL(string: "https://example.com/remote.mov"))]

        model.startExport()

        XCTAssertFalse(rendererInvoked)
        XCTAssertFalse(model.isExporting)
        XCTAssertNil(model.exportURL)
        XCTAssertEqual(
            model.notice,
            "Export uses media stored on this iPhone. Re-import any remote media before exporting."
        )
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
        XCTAssertTrue(model.activeProject?.segments.isEmpty == true)
        let environment = try model.makeMobileEditorEnvironment()
        XCTAssertEqual(environment.editorURL.path, "/import")
        environment.close()

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
        XCTAssertEqual(model.sharedLinkToImport, "https://www.tiktok.com/@ayahclip/video/123")
        XCTAssertEqual(
            model.notice,
            "Link ready. AyahClip will resolve the source video when the import screen opens."
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
            "https://vt.tiktok.com/ZSabc123/",
            "https://www.tiktok.com/@ayahclip/video/7626380472108485910?is_from_webapp=1",
            "https://www.instagram.com/reel/ABC123/",
            "https://www.instagram.com/share/reel/ABC123/?igsh=share",
            "https://youtube.com/shorts/xyz789?feature=share",
            "https://www.youtube.com/watch?v=xyz789",
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

    func testSocialReferenceCanBeExtractedFromPlatformShareText() throws {
        UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1")
        defer { UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1") }
        let sharedText = [
            (
                "A beautiful reminder 🤍\nhttps://vm.tiktok.com/ZM123/?_r=1#watch",
                "https://vm.tiktok.com/ZM123/?_r=1"
            ),
            (
                "Watch this reel from @ayahclip https://www.instagram.com/reel/ABC123/?igsh=share",
                "https://www.instagram.com/reel/ABC123/?igsh=share"
            ),
            (
                "Surah Maryam — YouTube Shorts\nhttps://youtube.com/shorts/xyz789?feature=share",
                "https://youtube.com/shorts/xyz789?feature=share"
            )
        ]

        for (text, expected) in sharedText {
            let model = AppModel()
            model.pendingLink = text
            XCTAssertTrue(model.referenceLink(), text)
            XCTAssertEqual(model.pendingLink, expected)
        }
    }

    func testSocialReferenceExtractionSkipsUnsupportedAndSpoofedLinks() {
        UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1")
        defer { UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1") }
        let model = AppModel()
        model.pendingLink = "Read https://example.com first, then https://tiktok.com.evil.example/video/123"

        XCTAssertFalse(model.referenceLink())
        XCTAssertNil(UserDefaults.standard.string(forKey: "ayahclip.lastReference.v1"))
    }

    func testReferenceValidationRejectsUnsafeOrUnsupportedURLs() {
        UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1")
        defer { UserDefaults.standard.removeObject(forKey: "ayahclip.lastReference.v1") }
        for reference in [
            "ftp://tiktok.com/video/123",
            "https://tiktok.com.evil.example/video/123",
            "https://user:password@youtube.com/shorts/123",
            "https://example.com/video/123",
            "https://www.tiktok.com/@ayahclip",
            "https://www.instagram.com/ayahclip/",
            "https://www.youtube.com/@ayahclip",
            "https://www.youtube.com/watch",
            "https://youtu.be/",
            String(repeating: "a", count: 2_049)
        ] {
            let model = AppModel()
            model.pendingLink = reference
            XCTAssertFalse(model.referenceLink(), reference)
        }
        XCTAssertNil(UserDefaults.standard.string(forKey: "ayahclip.lastReference.v1"))
    }

    func testSavingRequiresRenderedExport() async {
        let model = AppModel()
        model.exportURL = nil

        await model.saveExportToPhotos()

        XCTAssertEqual(model.notice, "Render the video before saving it to Photos.")
        XCTAssertFalse(model.isSavingToPhotos)
    }

    func testDeniedPhotosPermissionExplainsHowToRecoverWithoutAttemptingSave() async {
        var saveAttempted = false
        let model = AppModel(
            photoAuthorizationRequester: { .denied },
            photoSaver: { _ in saveAttempted = true }
        )
        model.exportURL = FileManager.default.temporaryDirectory.appendingPathComponent("finished.mp4")

        await model.saveExportToPhotos()

        XCTAssertFalse(saveAttempted)
        XCTAssertFalse(model.isSavingToPhotos)
        XCTAssertEqual(
            model.notice,
            "Photos access is off. Allow AyahClip to add photos in Settings, then try again."
        )
    }

    func testPhotosSaveFailureKeepsRenderedExportAvailableForRetry() async {
        struct SaveFailure: LocalizedError {
            var errorDescription: String? { "The device has no space for another video." }
        }
        let rendered = FileManager.default.temporaryDirectory.appendingPathComponent("finished.mp4")
        let model = AppModel(
            photoAuthorizationRequester: { .authorized },
            photoSaver: { _ in throw SaveFailure() }
        )
        model.exportURL = rendered

        await model.saveExportToPhotos()

        XCTAssertFalse(model.isSavingToPhotos)
        XCTAssertEqual(model.exportURL, rendered)
        XCTAssertEqual(
            model.notice,
            "Could not save the video to Photos: The device has no space for another video."
        )
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
        defer {
            defaults.removeObject(forKey: "pendingSharedFile")
            defaults.removeObject(forKey: "pendingSharedFiles")
        }

        let model = AppModel()
        await model.consumeSharedInbox()

        XCTAssertNil(defaults.string(forKey: "pendingSharedFile"))
        XCTAssertEqual(defaults.stringArray(forKey: "pendingSharedFiles"), [filename])
        XCTAssertNotNil(model.notice)
    }

    func testMultipleSharedFilesImportInDeliveryOrder() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "group.app.ayahclip.mobile"))
        let group = try XCTUnwrap(FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.app.ayahclip.mobile"
        ))
        let inbox = group.appendingPathComponent("Incoming", isDirectory: true)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let firstSource = try await makeTestVideo()
        let secondSource = try await makeTestVideo()
        let filenames = ["first-\(UUID().uuidString).mov", "second-\(UUID().uuidString).mov"]
        for (source, filename) in zip([firstSource, secondSource], filenames) {
            try FileManager.default.copyItem(at: source, to: inbox.appendingPathComponent(filename))
        }
        defaults.set(filenames, forKey: "pendingSharedFiles")
        defer {
            defaults.removeObject(forKey: "pendingSharedFiles")
            for filename in filenames {
                try? FileManager.default.removeItem(at: inbox.appendingPathComponent(filename))
            }
        }

        let model = AppModel()
        model.activeProject = nil
        await model.consumeSharedInbox()

        XCTAssertEqual(model.activeProject?.allMediaFilenames.count, 2)
        XCTAssertNil(defaults.stringArray(forKey: "pendingSharedFiles"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: inbox.appendingPathComponent(filenames[0]).path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: inbox.appendingPathComponent(filenames[1]).path))
        for url in model.importedMediaURLs { try? FileManager.default.removeItem(at: url) }
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

    func testDeletingOriginalKeepsMediaUsedByDuplicate() async throws {
        let source = try await makeTestVideo()
        let model = AppModel()
        model.projects = []
        model.activeProject = nil
        let imported = await model.importMedia(from: source)
        XCTAssertTrue(imported)
        model.saveActiveProject()
        let original = try XCTUnwrap(model.projects.first)
        let filename = try XCTUnwrap(original.mediaFilename)
        let storedURL = try XCTUnwrap(model.mediaURL(for: filename))

        model.duplicate(original)
        let duplicate = try XCTUnwrap(model.projects.first)
        model.delete(original)

        XCTAssertTrue(FileManager.default.fileExists(atPath: storedURL.path))
        XCTAssertEqual(duplicate.mediaFilename, filename)
        model.delete(duplicate)
        XCTAssertFalse(FileManager.default.fileExists(atPath: storedURL.path))
        model.activeProject = nil
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

    private func makeTestImage(color: UIColor) throws -> URL {
        let size = CGSize(width: 360, height: 640)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            color.setFill()
            UIRectFill(CGRect(origin: .zero, size: size))
        }
        guard let data = image.pngData() else { throw CocoaError(.fileWriteUnknown) }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("ayahclip-still-\(UUID().uuidString).png")
        try data.write(to: url, options: .atomic)
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
