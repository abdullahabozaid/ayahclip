import Foundation

/// Owns the native resources made available to one web-editor tab.
/// A session never exposes file-system paths and revokes every media handle
/// when it is replaced or closed.
final class MobileEditorSession {
    enum SessionError: LocalizedError, Equatable {
        case mediaCountMismatch
        case invalidProject
        case unsupportedMessage
        case projectMismatch
        case mediaMutation

        var errorDescription: String? {
            switch self {
            case .mediaCountMismatch:
                "The project media list changed before the editor could open. Try again."
            case .invalidProject:
                "This project contains invalid timing or style data and cannot be opened safely."
            case .unsupportedMessage:
                "The editor sent an unsupported project update. Refresh AyahClip and try again."
            case .projectMismatch:
                "The editor update belongs to a different project and was ignored."
            case .mediaMutation:
                "The web editor cannot replace private device media without using the native importer."
            }
        }
    }

    private let registry: NativeMediaRegistry
    private var activeProjectID: UUID?
    private var activeMedia: [NativeMediaDescriptor] = []

    init(registry: NativeMediaRegistry) {
        self.registry = registry
    }

    func prepare(
        project: ClipProject,
        mediaURLs: [URL]
    ) throws -> MobileBridgeEnvelope<MobileProjectSnapshotV1> {
        guard project.allMediaFilenames.count == mediaURLs.count else {
            throw SessionError.mediaCountMismatch
        }

        registry.revokeAll()
        do {
            let descriptors = try mediaURLs.map(registry.register)
            let snapshot = MobileProjectSnapshotV1(project: project, media: descriptors)
            guard snapshot.isValid else { throw SessionError.invalidProject }
            activeProjectID = project.id
            activeMedia = descriptors
            return MobileBridgeEnvelope(type: .hydrateProject, payload: snapshot)
        } catch {
            registry.revokeAll()
            activeProjectID = nil
            activeMedia = []
            throw error
        }
    }

    func applyProjectChange(
        _ envelope: MobileBridgeEnvelope<MobileProjectSnapshotV1>,
        to current: ClipProject
    ) throws -> ClipProject {
        guard envelope.isSupported,
              envelope.type == .projectChanged,
              envelope.payload.isValid else {
            throw SessionError.unsupportedMessage
        }
        guard let activeProjectID,
              current.id == activeProjectID,
              envelope.payload.id == activeProjectID.uuidString else {
            throw SessionError.projectMismatch
        }
        guard envelope.payload.media == activeMedia else {
            throw SessionError.mediaMutation
        }

        var project = current
        project.title = String(envelope.payload.title.prefix(200))
        if let quran = envelope.payload.quran {
            project.surahID = quran.surahId
            project.surahName = quran.surahName
            project.selectedVerseNumbers = quran.verseNumbers
            project.reciterID = quran.reciterId
            if let first = quran.verseNumbers.first, let last = quran.verseNumbers.last {
                project.verseRange = first == last ? "Verse \(first)" : "Verses \(first)-\(last)"
            }
        } else {
            project.surahID = nil
            project.selectedVerseNumbers = nil
            project.reciterID = nil
        }
        project.segments = envelope.payload.segments.map {
            VerseSegment(
                id: UUID(uuidString: $0.id)!,
                verse: $0.verseNumber,
                start: $0.start,
                end: $0.end,
                arabic: $0.arabic,
                translation: $0.translation
            )
        }
        if let first = project.segments.first {
            project.arabic = first.arabic ?? ""
            project.translation = first.translation ?? ""
        }
        switch envelope.payload.style.layout {
        case "sideFade": project.layout = .sideFade
        case "lowerThird": project.layout = .lowerThird
        default: project.layout = .centered
        }
        switch envelope.payload.style.captionStyle {
        case "crispOutline": project.captionStyle = .crispOutline
        case "gold": project.captionStyle = .gold
        case "clean": project.captionStyle = .clean
        default: project.captionStyle = .softGlow
        }
        project.arabicSize = envelope.payload.style.arabicSize
        project.translationSize = envelope.payload.style.translationSize
        project.overlayOpacity = envelope.payload.style.overlayOpacity
        project.webEditorDocumentJSON = envelope.payload.editorDocumentJSON
        project.updatedAt = Date()
        return project
    }

    func registerAdditionalMedia(_ mediaURLs: [URL]) throws -> [NativeMediaDescriptor] {
        guard activeProjectID != nil else { throw SessionError.projectMismatch }
        guard !mediaURLs.isEmpty,
              activeMedia.count + mediaURLs.count <= MediaImportPolicy.maxMediaCount else {
            throw SessionError.mediaCountMismatch
        }
        var added: [NativeMediaDescriptor] = []
        do {
            for url in mediaURLs { added.append(try registry.register(url)) }
            activeMedia.append(contentsOf: added)
            return added
        } catch {
            registry.revoke(handles: added.map(\.id))
            throw error
        }
    }

    func close() {
        registry.revokeAll()
        activeProjectID = nil
        activeMedia = []
    }
}
