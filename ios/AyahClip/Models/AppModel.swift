import AVFoundation
import Foundation
import ImageIO
import Observation
import Photos
import UniformTypeIdentifiers

@MainActor
@Observable
final class AppModel {
    enum MediaPlacement: Equatable {
        case primaryIfEmpty
        case additional
    }

    typealias ExportRenderer = @MainActor ([URL], ClipProject) async throws -> URL
    typealias AvailableCapacityProvider = @MainActor (URL) throws -> Int64?
    typealias PhotoAuthorizationRequester = @MainActor () async -> PHAuthorizationStatus
    typealias PhotoSaver = @MainActor (URL) async throws -> Void
    typealias NativeMediaImporter = @MainActor (
        MobileMediaImportRequestPayload
    ) async throws -> [URL]

    private let appGroup = "group.app.ayahclip.mobile"
    enum AppTab: Hashable {
        case projects
        case `import`
        case settings
    }

    var projects: [ClipProject] = []
    var selectedTab: AppTab = .projects
    var activeProject: ClipProject?
    var importedMediaURLs: [URL] = []
    var importedMediaURL: URL? { importedMediaURLs.first }
    var pendingLink = ""
    /// One-shot URL delivered by the system Share Sheet. Unlike `pendingLink`,
    /// this is not restored on every launch, so an old post never re-downloads.
    var sharedLinkToImport: String?
    var notice: String?
    var quranChapters: [QuranChapter] = []
    var quranVerses: [QuranCatalogVerse] = []
    var isLoadingQuran = false
    var isImporting = false
    var isExporting = false
    var isSavingToPhotos = false
    var exportURL: URL?
    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    private let projectsKey = "ayahclip.projects.v2"
    private let referenceKey = "ayahclip.lastReference.v1"
    private let historyLimit = 100
    private var undoStack: [ClipProject] = []
    private var redoStack: [ClipProject] = []
    @ObservationIgnored private var autosaveTask: Task<Void, Never>?
    @ObservationIgnored private var exportTask: Task<Void, Never>?
    @ObservationIgnored private let exportRenderer: ExportRenderer
    @ObservationIgnored private let availableCapacityProvider: AvailableCapacityProvider
    @ObservationIgnored private let photoAuthorizationRequester: PhotoAuthorizationRequester
    @ObservationIgnored private let photoSaver: PhotoSaver
    @ObservationIgnored private let quranCatalog: QuranCatalogService
    private var exportRequestID: UUID?
    private var quranRequestID: UUID?

    init(
        exportRenderer: @escaping ExportRenderer = { sourceURLs, project in
            try await VideoExportService.render(sourceURLs: sourceURLs, project: project)
        },
        availableCapacityProvider: @escaping AvailableCapacityProvider = { directory in
            try directory.resourceValues(
                forKeys: [.volumeAvailableCapacityForImportantUsageKey]
            ).volumeAvailableCapacityForImportantUsage
        },
        photoAuthorizationRequester: @escaping PhotoAuthorizationRequester = {
            await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        },
        photoSaver: @escaping PhotoSaver = { exportURL in
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: exportURL)
            }
        },
        quranCatalog: QuranCatalogService = QuranCatalogService()
    ) {
        self.exportRenderer = exportRenderer
        self.availableCapacityProvider = availableCapacityProvider
        self.photoAuthorizationRequester = photoAuthorizationRequester
        self.photoSaver = photoSaver
        self.quranCatalog = quranCatalog
        loadProjects()
        pendingLink = UserDefaults.standard.string(forKey: referenceKey) ?? ""
    }

    func loadQuranChapters() async {
        if quranChapters.count == 114 { return }
        let requestID = UUID()
        quranRequestID = requestID
        isLoadingQuran = true
        defer {
            if quranRequestID == requestID { isLoadingQuran = false }
        }
        do {
            let chapters = try await quranCatalog.fetchChapters()
            guard quranRequestID == requestID else { return }
            quranChapters = chapters
        } catch {
            guard quranRequestID == requestID else { return }
            notice = error.localizedDescription
        }
    }

    func loadQuranVerses(chapter: Int) async {
        let requestID = UUID()
        quranRequestID = requestID
        isLoadingQuran = true
        defer {
            if quranRequestID == requestID { isLoadingQuran = false }
        }
        do {
            let verses = try await quranCatalog.fetchVerses(chapter: chapter)
            guard quranRequestID == requestID else { return }
            quranVerses = verses
        } catch {
            guard quranRequestID == requestID else { return }
            notice = error.localizedDescription
        }
    }

    @discardableResult
    func applyQuranRange(chapterID: Int, from: Int, to: Int) -> Bool {
        guard let chapter = quranChapters.first(where: { $0.id == chapterID }) else {
            notice = "Choose a surah before continuing."
            return false
        }
        let lower = min(from, to)
        let upper = max(from, to)
        let verses = quranVerses.filter {
            $0.verseNumber >= lower && $0.verseNumber <= upper
        }
        guard verses.count == upper - lower + 1,
              verses.first?.verseNumber == lower,
              verses.last?.verseNumber == upper else {
            notice = "AyahClip has not loaded that complete verse range yet. Try again."
            return false
        }
        if activeProject == nil { createProject() }
        updateActive { project in
            project.applyQuranRange(chapter: chapter, verses: verses)
        }
        notice = nil
        return true
    }

    func createProject() {
        cancelExport()
        resetHistory()
        activeProject = .freshDraft()
        importedMediaURLs = []
        exportURL = nil
    }

    func open(_ project: ClipProject) {
        cancelExport()
        resetHistory()
        activeProject = project
        importedMediaURLs = project.allMediaFilenames.compactMap(mediaURL(for:))
        exportURL = nil
    }

    func duplicate(_ project: ClipProject) {
        var copy = project
        copy.id = UUID()
        copy.title = "\(project.title) Copy"
        copy.createdAt = Date()
        copy.updatedAt = Date()
        projects.insert(copy, at: 0)
        persistProjects()
    }

    func delete(_ project: ClipProject) {
        projects.removeAll { $0.id == project.id }
        for filename in project.allMediaFilenames where
            !projects.contains(where: { $0.allMediaFilenames.contains(filename) }) {
            if let url = mediaURL(for: filename) {
                try? FileManager.default.removeItem(at: url)
            }
        }
        persistProjects()
    }

    func saveActiveProject() {
        guard var project = activeProject else { return }
        project.updatedAt = Date()
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
        } else {
            projects.insert(project, at: 0)
        }
        activeProject = project
        persistProjects()
    }

    func closeEditor() {
        cancelExport()
        autosaveTask?.cancel()
        saveActiveProject()
        activeProject = nil
        importedMediaURLs = []
        exportURL = nil
        resetHistory()
        cleanupUnreferencedMedia()
    }

    func updateActive(recordHistory: Bool = true, _ update: (inout ClipProject) -> Void) {
        guard let original = activeProject else { return }
        var project = original
        update(&project)
        guard project != original else { return }
        project.updatedAt = Date()
        replaceActiveProject(project, previous: original, recordHistory: recordHistory)
    }

    func applyMobileEditorChange(
        _ envelope: MobileBridgeEnvelope<MobileProjectSnapshotV1>,
        session: MobileEditorSession
    ) throws {
        guard let current = activeProject else {
            throw MobileEditorSession.SessionError.projectMismatch
        }
        let updated = try session.applyProjectChange(envelope, to: current)
        // Studio owns its own fine-grained undo history. Native receives a
        // synchronized checkpoint, so each autosave must not flood Swift undo.
        replaceActiveProject(updated, previous: current, recordHistory: false)
    }

    func makeMobileEditorEnvironment(
        entryPoint: MobileEditorEntryPoint = .editor,
        mediaImporter: @escaping NativeMediaImporter = { _ in
            throw MobileEditorSession.SessionError.unsupportedMessage
        }
    ) throws -> MobileEditorEnvironment {
        guard let project = activeProject else {
            throw MobileEditorSession.SessionError.projectMismatch
        }
        return try MobileEditorEnvironment(
            project: project,
            mediaURLs: importedMediaURLs,
            entryPoint: entryPoint,
            sourceReferenceURL: sharedLinkToImport,
            allowedMediaRoots: [try mediaDirectory()],
            onProjectChange: { [weak self] envelope, session in
                guard let self else { throw CancellationError() }
                try self.applyMobileEditorChange(envelope, session: session)
            },
            onExportComplete: { [weak self] url in
                guard let self else { throw CancellationError() }
                try await self.receiveMobileEditorExport(url)
            },
            onMediaImportRequest: { [weak self] payload, session in
                guard let self else { throw CancellationError() }
                let sourceURLs = try await mediaImporter(payload)
                guard !sourceURLs.isEmpty, sourceURLs.count <= payload.maxCount else {
                    throw MobileEditorSession.SessionError.mediaCountMismatch
                }
                let existing = Set(self.importedMediaURLs)
                let placement: MediaPlacement = payload.purpose == .primary
                    ? .primaryIfEmpty
                    : .additional
                guard await self.importMedia(from: sourceURLs, placement: placement) else {
                    throw MobileEditorSession.SessionError.mediaMutation
                }
                let addedURLs = self.importedMediaURLs.filter { !existing.contains($0) }
                let descriptors = try session.registerAdditionalMedia(addedURLs)
                return MobileMediaImportResultPayload(media: descriptors)
            }
        )
    }

    func undo() {
        guard let current = activeProject, let previous = undoStack.popLast() else { return }
        appendHistory(current, to: &redoStack)
        restoreActiveProject(previous)
    }

    func redo() {
        guard let current = activeProject, let next = redoStack.popLast() else { return }
        appendHistory(current, to: &undoStack)
        restoreActiveProject(next)
    }

    func moveMedia(from sourceIndex: Int, to destinationIndex: Int) async {
        guard let original = activeProject else { return }
        var project = original
        var filenames = project.allMediaFilenames
        guard filenames.indices.contains(sourceIndex), filenames.indices.contains(destinationIndex) else { return }
        let filename = filenames.remove(at: sourceIndex)
        filenames.insert(filename, at: destinationIndex)
        project.setMediaFilenames(filenames)
        let mediaURLs = filenames.compactMap(mediaURL(for:))
        if let duration = await VideoExportService.preferredTimelineDuration(
            sourceURLs: mediaURLs,
            project: project
        ) {
            project.fitSegments(to: duration)
        }
        project.updatedAt = Date()
        replaceActiveProject(project, previous: original)
    }

    func removeMedia(at index: Int) async {
        guard let original = activeProject else { return }
        var project = original
        var filenames = project.allMediaFilenames
        guard filenames.indices.contains(index) else { return }
        filenames.remove(at: index)
        project.setMediaFilenames(filenames)
        let mediaURLs = filenames.compactMap(mediaURL(for:))
        if let duration = await VideoExportService.preferredTimelineDuration(
            sourceURLs: mediaURLs,
            project: project
        ) {
            project.fitSegments(to: duration)
        }
        project.updatedAt = Date()
        // Keep detached media until the editor closes so Undo can restore it.
        replaceActiveProject(project, previous: original)
    }

    @discardableResult
    func importMedia(from sourceURL: URL) async -> Bool {
        await importMedia(from: [sourceURL], placement: .primaryIfEmpty)
    }

    @discardableResult
    func importMedia(from sourceURLs: [URL]) async -> Bool {
        await importMedia(from: sourceURLs, placement: .primaryIfEmpty)
    }

    @discardableResult
    func importMedia(
        from sourceURLs: [URL],
        placement: MediaPlacement
    ) async -> Bool {
        guard !sourceURLs.isEmpty else { return false }
        let attachedCount = activeProject?.allMediaFilenames.count ?? 0
        do {
            try MediaImportPolicy.validateBatch(
                attachedCount: attachedCount,
                incomingCount: sourceURLs.count
            )
        } catch {
            notice = error.localizedDescription
            return false
        }
        isImporting = true
        defer { isImporting = false }

        var destinations: [URL] = []
        var imageFilenames = Set<String>()
        var accessedURLs: [URL] = []
        defer { accessedURLs.forEach { $0.stopAccessingSecurityScopedResource() } }
        do {
            let directory = try mediaDirectory()
            for sourceURL in sourceURLs {
                if sourceURL.startAccessingSecurityScopedResource() { accessedURLs.append(sourceURL) }
                let sourceBytes = Int64(
                    try sourceURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                )
                let availableBytes = try availableCapacityProvider(directory)
                try MediaImportPolicy.validateFile(
                    fileBytes: sourceBytes,
                    availableBytes: availableBytes
                )
                let extensionName = sourceURL.pathExtension.isEmpty ? "mov" : sourceURL.pathExtension
                let destination = directory.appendingPathComponent("\(UUID().uuidString).\(extensionName)")
                try FileManager.default.copyItem(at: sourceURL, to: destination)
                destinations.append(destination)
                let declaredType = UTType(filenameExtension: destination.pathExtension)
                let hasImage = declaredType?.conforms(to: .image) == true
                if hasImage {
                    guard CGImageSourceCreateWithURL(destination as CFURL, nil) != nil else {
                        throw CocoaError(.fileReadCorruptFile)
                    }
                    imageFilenames.insert(destination.lastPathComponent)
                    continue
                }
                let asset = AVURLAsset(url: destination)
                let hasVideo = try await !asset.loadTracks(withMediaType: .video).isEmpty
                let hasAudio = try await !asset.loadTracks(withMediaType: .audio).isEmpty
                guard hasVideo || hasAudio else {
                    throw CocoaError(.fileReadCorruptFile)
                }
            }

            if activeProject == nil {
                resetHistory()
                activeProject = .freshDraft()
            }
            guard let original = activeProject else { return false }
            var project = original
            let isAddingPrimary = placement == .primaryIfEmpty
                && activeProject?.mediaFilename == nil
            let sourceReference = normalizedReferenceURL(from: pendingLink)?.absoluteString
            var filenames = destinations.map(\.lastPathComponent)
            if isAddingPrimary, let primary = filenames.first {
                project.mediaFilename = primary
                if let sourceReference { project.sourceReferenceURL = sourceReference }
                filenames.removeFirst()
            }
            var bRoll = project.bRollFilenames ?? []
            bRoll.append(contentsOf: filenames)
            project.bRollFilenames = bRoll
            for filename in imageFilenames {
                project.setMediaDuration(project.fallbackVisualDuration, for: filename)
            }

            let mediaURLs = project.allMediaFilenames.compactMap(mediaURL(for:))
            if isAddingPrimary,
               let duration = await VideoExportService.preferredTimelineDuration(
                    sourceURLs: mediaURLs,
                    project: project
               ) {
                project.fitSegments(to: duration)
            }
            project.updatedAt = Date()
            replaceActiveProject(project, previous: original)
            return true
        } catch {
            destinations.forEach { try? FileManager.default.removeItem(at: $0) }
            notice = "Could not import that file: \(error.localizedDescription)"
            return false
        }
    }

    @discardableResult
    func referenceLink() -> Bool {
        guard let url = normalizedReferenceURL(from: pendingLink) else {
            notice = "Paste a complete TikTok, Instagram, or YouTube link."
            return false
        }
        pendingLink = url.absoluteString
        UserDefaults.standard.set(pendingLink, forKey: referenceKey)
        notice = "Link ready. AyahClip will resolve the source video when the import screen opens."
        return true
    }

    func receiveSharedURL(_ url: URL) {
        if url.scheme == "ayahclip" {
            switch url.host {
            case "import":
                selectedTab = .import
                return
            case "new":
                createProject()
                return
            default:
                break
            }
        }
        if url.isFileURL {
            Task { await importMedia(from: url) }
        } else {
            pendingLink = url.absoluteString
            sharedLinkToImport = url.absoluteString
            referenceLink()
        }
    }

    func consumeSharedInbox() async {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        var queuedFiles = defaults.stringArray(forKey: "pendingSharedFiles") ?? []
        if let legacyFile = defaults.string(forKey: "pendingSharedFile"),
           !queuedFiles.contains(legacyFile) {
            queuedFiles.insert(legacyFile, at: 0)
        }
        if !queuedFiles.isEmpty,
           let group = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
           ) {
            selectedTab = .import
            var remainingFiles: [String] = []
            for filename in queuedFiles {
                let source = group
                    .appendingPathComponent("Incoming", isDirectory: true)
                    .appendingPathComponent(filename)
                if await importMedia(from: source) {
                    try? FileManager.default.removeItem(at: source)
                } else {
                    remainingFiles.append(filename)
                }
            }
            defaults.removeObject(forKey: "pendingSharedFile")
            if remainingFiles.isEmpty {
                defaults.removeObject(forKey: "pendingSharedFiles")
            } else {
                defaults.set(remainingFiles, forKey: "pendingSharedFiles")
            }
        }

        if let link = defaults.string(forKey: "pendingSharedLink") {
            pendingLink = link
            sharedLinkToImport = link
            selectedTab = .import
            // The App Group key is a delivery inbox, not permanent storage.
            // Once delivered, keep valid references in standard defaults and
            // leave invalid text in the field for correction without showing
            // the same alert every time the app becomes active.
            _ = referenceLink()
            defaults.removeObject(forKey: "pendingSharedLink")
        }
    }

    func startExport() {
        guard let project = activeProject, !importedMediaURLs.isEmpty else {
            notice = "Import a video before exporting."
            return
        }
        guard importedMediaURLs.allSatisfy(\.isFileURL) else {
            notice = "Export uses media stored on this iPhone. Re-import any remote media before exporting."
            return
        }
        guard exportTask == nil else { return }
        let sourceURLs = importedMediaURLs
        let projectID = project.id
        let renderer = exportRenderer
        let requestID = UUID()
        exportRequestID = requestID
        exportURL = nil
        isExporting = true
        exportTask = Task { [weak self] in
            do {
                let output = try await renderer(sourceURLs, project)
                try Task.checkCancellation()
                guard let self,
                      self.exportRequestID == requestID,
                      self.activeProject?.id == projectID else {
                    try? FileManager.default.removeItem(at: output)
                    return
                }
                self.exportURL = output
            } catch is CancellationError {
                // Cancellation is an expected editor action, not an alert.
            } catch {
                guard let self, self.exportRequestID == requestID else { return }
                self.notice = "Export failed: \(error.localizedDescription)"
            }
            guard let self, self.exportRequestID == requestID else { return }
            self.exportRequestID = nil
            self.exportTask = nil
            self.isExporting = false
        }
    }

    func cancelExport() {
        exportRequestID = nil
        exportTask?.cancel()
        exportTask = nil
        isExporting = false
        exportURL = nil
    }

    func saveExportToPhotos() async {
        guard let exportURL else {
            notice = "Render the video before saving it to Photos."
            return
        }

        isSavingToPhotos = true
        defer { isSavingToPhotos = false }
        let status = await photoAuthorizationRequester()
        guard status == .authorized || status == .limited else {
            notice = "Photos access is off. Allow AyahClip to add photos in Settings, then try again."
            return
        }

        do {
            try await photoSaver(exportURL)
            notice = "Video saved to Photos."
        } catch {
            notice = "Could not save the video to Photos: \(error.localizedDescription)"
        }
    }

    /// Accepts a completed MP4/WebM from the embedded Studio, moves it out of
    /// the bridge transfer directory, and completes the same explicit Photos
    /// permission/save path as a native render.
    func receiveMobileEditorExport(_ temporaryURL: URL) async throws {
        guard activeProject != nil,
              temporaryURL.isFileURL,
              FileManager.default.fileExists(atPath: temporaryURL.path) else {
            throw CocoaError(.fileNoSuchFile)
        }
        let values = try temporaryURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        let size = Int64(values.fileSize ?? 0)
        let ext = temporaryURL.pathExtension.lowercased()
        guard values.isRegularFile == true,
              size > 0,
              size <= MobileExportTransferSession.maxFileSize,
              ext == "mp4" else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AyahClipCompletedExports", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent("\(UUID().uuidString).\(ext)")
        try FileManager.default.moveItem(at: temporaryURL, to: destination)
        exportURL = destination

        let status = await photoAuthorizationRequester()
        guard status == .authorized || status == .limited else {
            notice = "Video is ready in AyahClip. Photos access is off; enable Add Photos in Settings to save it."
            return
        }
        do {
            try await photoSaver(destination)
            notice = "Video saved to Photos."
        } catch {
            notice = "The video is ready in AyahClip, but Photos could not save it: \(error.localizedDescription)"
        }
    }

    func mediaURL(for filename: String) -> URL? {
        try? mediaDirectory().appendingPathComponent(filename)
    }

    private func mediaDirectory() throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = root.appendingPathComponent("Media", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func loadProjects() {
        guard let data = UserDefaults.standard.data(forKey: projectsKey),
              let decoded = try? JSONDecoder().decode([ClipProject].self, from: data) else { return }
        projects = decoded.map { $0.removingLegacyPlaceholderIfNeeded() }
    }

    private func persistProjects() {
        guard let data = try? JSONEncoder().encode(projects) else { return }
        UserDefaults.standard.set(data, forKey: projectsKey)
    }

    private func replaceActiveProject(
        _ project: ClipProject,
        previous: ClipProject,
        recordHistory: Bool = true
    ) {
        guard project != previous else { return }
        if recordHistory {
            appendHistory(previous, to: &undoStack)
            redoStack.removeAll(keepingCapacity: true)
        }
        restoreActiveProject(project)
    }

    private func restoreActiveProject(_ project: ClipProject) {
        cancelExport()
        activeProject = project
        importedMediaURLs = project.allMediaFilenames.compactMap(mediaURL(for:))
        exportURL = nil
        scheduleAutosave()
    }

    private func appendHistory(_ project: ClipProject, to stack: inout [ClipProject]) {
        stack.append(project)
        if stack.count > historyLimit {
            stack.removeFirst(stack.count - historyLimit)
        }
    }

    private func resetHistory() {
        undoStack.removeAll(keepingCapacity: true)
        redoStack.removeAll(keepingCapacity: true)
    }

    private func scheduleAutosave() {
        autosaveTask?.cancel()
        autosaveTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(400))
            } catch {
                return
            }
            self?.saveActiveProject()
        }
    }

    private func cleanupUnreferencedMedia() {
        guard let directory = try? mediaDirectory(),
              let files = try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: nil
              ) else { return }
        let referenced = Set(projects.flatMap(\.allMediaFilenames))
        for file in files where !referenced.contains(file.lastPathComponent) {
            try? FileManager.default.removeItem(at: file)
        }
    }

    private func normalizedReferenceURL(from value: String) -> URL? {
        SocialReferencePolicy.normalizedURL(from: value)
    }
}
