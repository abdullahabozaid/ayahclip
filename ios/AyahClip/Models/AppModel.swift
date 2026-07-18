import AVFoundation
import Foundation
import Observation

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
    var importedMediaURL: URL?
    var pendingLink = ""
    var notice: String?
    var isImporting = false
    var isExporting = false
    var exportURL: URL?

    private let projectsKey = "ayahclip.projects.v2"

    init() {
        loadProjects()
    }

    func createProject() {
        activeProject = .starter
        importedMediaURL = nil
    }

    func open(_ project: ClipProject) {
        activeProject = project
        importedMediaURL = project.mediaFilename.flatMap(mediaURL(for:))
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
        if let filename = project.mediaFilename,
           !projects.contains(where: { $0.mediaFilename == filename }),
           let url = mediaURL(for: filename) {
            try? FileManager.default.removeItem(at: url)
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
        notice = "Saved on this device"
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

    func importMedia(from sourceURL: URL) async {
        isImporting = true
        defer { isImporting = false }

        let didAccess = sourceURL.startAccessingSecurityScopedResource()
        defer { if didAccess { sourceURL.stopAccessingSecurityScopedResource() } }

        do {
            let directory = try mediaDirectory()
            let extensionName = sourceURL.pathExtension.isEmpty ? "mov" : sourceURL.pathExtension
            let destination = directory.appendingPathComponent("\(UUID().uuidString).\(extensionName)")
            try FileManager.default.copyItem(at: sourceURL, to: destination)
            importedMediaURL = destination
            if activeProject == nil { activeProject = .starter }
            let asset = AVURLAsset(url: destination)
            let duration = try await asset.load(.duration).seconds
            updateActive {
                $0.mediaFilename = destination.lastPathComponent
                $0.fitSegments(to: duration)
            }
            notice = "Media imported locally"
        } catch {
            notice = "Could not import that file: \(error.localizedDescription)"
        }
    }

    func referenceLink() {
        guard let url = URL(string: pendingLink), let host = url.host else {
            notice = "Paste a complete TikTok, Instagram, or YouTube link."
            return
        }
        let supported = ["tiktok.com", "instagram.com", "youtube.com", "youtu.be"].contains {
            host == $0 || host.hasSuffix(".\($0)")
        }
        guard supported else {
            notice = "That platform is not supported yet."
            return
        }
        notice = "Link saved as a reference. Import the original file you own from Photos or Files to edit it."
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
            defaults.removeObject(forKey: "pendingSharedFile")
            let source = group
                .appendingPathComponent("Incoming", isDirectory: true)
                .appendingPathComponent(filename)
            selectedTab = .import
            await importMedia(from: source)
            try? FileManager.default.removeItem(at: source)
        }

        if let link = defaults.string(forKey: "pendingSharedLink") {
            defaults.removeObject(forKey: "pendingSharedLink")
            pendingLink = link
            selectedTab = .import
            referenceLink()
        }
    }

    func exportActiveProject() async {
        guard let project = activeProject, let sourceURL = importedMediaURL else {
            notice = "Import a video before exporting."
            return
        }
        isExporting = true
        defer { isExporting = false }
        do {
            exportURL = try await VideoExportService.render(sourceURL: sourceURL, project: project)
            notice = "Your captioned MP4 is ready to share."
        } catch {
            notice = "Export failed: \(error.localizedDescription)"
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
}
