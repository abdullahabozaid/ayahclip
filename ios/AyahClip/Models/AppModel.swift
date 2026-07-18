import AVFoundation
import Foundation
import Observation
import Photos

@MainActor
@Observable
final class AppModel {
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
    var notice: String?
    var isImporting = false
    var isExporting = false
    var isSavingToPhotos = false
    var exportURL: URL?

    private let projectsKey = "ayahclip.projects.v2"
    private let referenceKey = "ayahclip.lastReference.v1"

    init() {
        loadProjects()
        pendingLink = UserDefaults.standard.string(forKey: referenceKey) ?? ""
    }

    func createProject() {
        activeProject = .starter
        importedMediaURLs = []
    }

    func open(_ project: ClipProject) {
        activeProject = project
        importedMediaURLs = project.allMediaFilenames.compactMap(mediaURL(for:))
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
        saveActiveProject()
        activeProject = nil
        exportURL = nil
    }

    func updateActive(_ update: (inout ClipProject) -> Void) {
        guard var project = activeProject else { return }
        update(&project)
        project.updatedAt = Date()
        activeProject = project
    }

    func moveMedia(from sourceIndex: Int, to destinationIndex: Int) async {
        guard var project = activeProject else { return }
        var filenames = project.allMediaFilenames
        guard filenames.indices.contains(sourceIndex), filenames.indices.contains(destinationIndex) else { return }
        let filename = filenames.remove(at: sourceIndex)
        filenames.insert(filename, at: destinationIndex)
        project.setMediaFilenames(filenames)
        project.updatedAt = Date()
        activeProject = project
        importedMediaURLs = filenames.compactMap(mediaURL(for:))
        exportURL = nil
        if let primaryURL = importedMediaURLs.first,
           let duration = try? await AVURLAsset(url: primaryURL).load(.duration).seconds {
            updateActive { $0.fitSegments(to: duration) }
        }
    }

    func removeMedia(at index: Int) async {
        guard var project = activeProject else { return }
        var filenames = project.allMediaFilenames
        guard filenames.indices.contains(index) else { return }
        let removed = filenames.remove(at: index)
        project.setMediaFilenames(filenames)
        project.updatedAt = Date()
        activeProject = project
        importedMediaURLs = filenames.compactMap(mediaURL(for:))
        exportURL = nil

        let referencedElsewhere = projects.contains {
            $0.id != project.id && $0.allMediaFilenames.contains(removed)
        }
        if !referencedElsewhere, let url = mediaURL(for: removed) {
            try? FileManager.default.removeItem(at: url)
        }
        if let primaryURL = importedMediaURLs.first,
           let duration = try? await AVURLAsset(url: primaryURL).load(.duration).seconds {
            updateActive { $0.fitSegments(to: duration) }
        }
    }

    @discardableResult
    func importMedia(from sourceURL: URL) async -> Bool {
        await importMedia(from: [sourceURL])
    }

    @discardableResult
    func importMedia(from sourceURLs: [URL]) async -> Bool {
        guard !sourceURLs.isEmpty else { return false }
        isImporting = true
        defer { isImporting = false }

        var destinations: [URL] = []
        var accessedURLs: [URL] = []
        defer { accessedURLs.forEach { $0.stopAccessingSecurityScopedResource() } }
        do {
            let directory = try mediaDirectory()
            for sourceURL in sourceURLs {
                if sourceURL.startAccessingSecurityScopedResource() { accessedURLs.append(sourceURL) }
                let extensionName = sourceURL.pathExtension.isEmpty ? "mov" : sourceURL.pathExtension
                let destination = directory.appendingPathComponent("\(UUID().uuidString).\(extensionName)")
                try FileManager.default.copyItem(at: sourceURL, to: destination)
                destinations.append(destination)
                let asset = AVURLAsset(url: destination)
                let hasVideo = try await !asset.loadTracks(withMediaType: .video).isEmpty
                let hasAudio = try await !asset.loadTracks(withMediaType: .audio).isEmpty
                guard hasVideo || hasAudio else {
                    throw CocoaError(.fileReadCorruptFile)
                }
            }

            if activeProject == nil { activeProject = .starter }
            let isAddingPrimary = activeProject?.mediaFilename == nil
            let sourceReference = normalizedReferenceURL(from: pendingLink)?.absoluteString
            updateActive { project in
                var filenames = destinations.map(\.lastPathComponent)
                if project.mediaFilename == nil, let primary = filenames.first {
                    project.mediaFilename = primary
                    if let sourceReference { project.sourceReferenceURL = sourceReference }
                    filenames.removeFirst()
                }
                var bRoll = project.bRollFilenames ?? []
                bRoll.append(contentsOf: filenames)
                project.bRollFilenames = bRoll
            }
            importedMediaURLs = activeProject?.allMediaFilenames.compactMap(mediaURL(for:)) ?? []

            if isAddingPrimary, let primaryURL = importedMediaURLs.first {
                let duration = try await AVURLAsset(url: primaryURL).load(.duration).seconds
                updateActive { $0.fitSegments(to: duration) }
            }
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
        notice = "Reference saved on this iPhone. Import the original file you own from Photos or Files to edit it."
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
            referenceLink()
        }
    }

    func consumeSharedInbox() async {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        if let filename = defaults.string(forKey: "pendingSharedFile"),
           let group = FileManager.default.containerURL(
               forSecurityApplicationGroupIdentifier: appGroup
           ) {
            let source = group
                .appendingPathComponent("Incoming", isDirectory: true)
                .appendingPathComponent(filename)
            selectedTab = .import
            if await importMedia(from: source) {
                defaults.removeObject(forKey: "pendingSharedFile")
                try? FileManager.default.removeItem(at: source)
            }
        }

        if let link = defaults.string(forKey: "pendingSharedLink") {
            pendingLink = link
            selectedTab = .import
            // The App Group key is a delivery inbox, not permanent storage.
            // Once delivered, keep valid references in standard defaults and
            // leave invalid text in the field for correction without showing
            // the same alert every time the app becomes active.
            _ = referenceLink()
            defaults.removeObject(forKey: "pendingSharedLink")
        }
    }

    func exportActiveProject() async {
        guard let project = activeProject, !importedMediaURLs.isEmpty else {
            notice = "Import a video before exporting."
            return
        }
        isExporting = true
        defer { isExporting = false }
        do {
            exportURL = try await VideoExportService.render(sourceURLs: importedMediaURLs, project: project)
        } catch {
            notice = "Export failed: \(error.localizedDescription)"
        }
    }

    func saveExportToPhotos() async {
        guard let exportURL else {
            notice = "Render the video before saving it to Photos."
            return
        }

        isSavingToPhotos = true
        defer { isSavingToPhotos = false }
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            notice = "Photos access is off. Allow AyahClip to add photos in Settings, then try again."
            return
        }

        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: exportURL)
            }
            notice = "Video saved to Photos."
        } catch {
            notice = "Could not save the video to Photos: \(error.localizedDescription)"
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
        projects = decoded
    }

    private func persistProjects() {
        guard let data = try? JSONEncoder().encode(projects) else { return }
        UserDefaults.standard.set(data, forKey: projectsKey)
    }

    private func normalizedReferenceURL(from value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.utf8.count <= 2_048,
              var components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              components.user == nil, components.password == nil,
              let host = components.host?.lowercased() else { return nil }

        let supported = ["tiktok.com", "instagram.com", "youtube.com", "youtu.be"].contains {
            host == $0 || host.hasSuffix(".\($0)")
        }
        guard supported else { return nil }
        components.scheme = scheme
        components.host = host
        components.fragment = nil
        return components.url
    }
}
