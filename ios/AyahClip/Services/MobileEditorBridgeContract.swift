import Foundation

enum MobileBridgeMessageType: String, Codable, CaseIterable, Sendable {
    case ready
    case hydrateProject
    case projectChanged
    case requestMediaImport
    case mediaImported
    case detectionProgress
    case detectionResult
    case requestExport
    case exportChunk
    case exportComplete
    case exportCancel
    case exportReady
    case error
}

struct MobileBridgeEnvelope<Payload: Codable & Equatable>: Codable, Equatable {
    let protocolVersion: Int
    let id: String
    let type: MobileBridgeMessageType
    let payload: Payload

    init(id: String = UUID().uuidString, type: MobileBridgeMessageType, payload: Payload) {
        protocolVersion = MobileEditorBridgeContract.protocolVersion
        self.id = id
        self.type = type
        self.payload = payload
    }

    var isSupported: Bool {
        protocolVersion == MobileEditorBridgeContract.protocolVersion
            && !id.isEmpty
            && id.utf8.count <= 128
    }
}

struct MobileEditorReadyPayload: Codable, Equatable, Sendable {
    let rendererVersion: String
    let capabilities: [String]
}

struct MobileDetectionResultPayload: Codable, Equatable, Sendable {
    struct Alternative: Codable, Equatable, Sendable {
        let surahId: Int
        let ayahStart: Int
        let ayahEnd: Int
        let confidence: Double
    }

    enum Confidence: String, Codable, Sendable {
        case high
        case medium
        case low
        case selected
    }

    let surahId: Int
    let ayahStart: Int
    let ayahEnd: Int
    let confidence: Confidence
    let reviewVerseNumbers: [Int]
    let alternatives: [Alternative]
}

struct MobileExportRequestPayload: Codable, Equatable, Sendable {
    let fileName: String
    let mimeType: String
    let fileSize: Int64
    let totalChunks: Int
}

struct MobileExportChunkPayload: Codable, Equatable, Sendable {
    let exportId: String
    let index: Int
    let totalChunks: Int
    let base64Data: String
}

struct MobileExportControlPayload: Codable, Equatable, Sendable {
    let exportId: String
    let totalChunks: Int?
}

struct MobileExportReadyPayload: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable {
        case ready
        case complete
        case cancelled
    }

    let exportId: String
    let status: Status
    let chunkSize: Int
    let fileName: String?
}

struct MobileMediaImportRequestPayload: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable, Hashable {
        case image
        case video
        case audio
    }

    enum Purpose: String, Codable, Sendable {
        case primary
        case broll
        case replacement
    }

    let kinds: [Kind]
    let maxCount: Int
    let purpose: Purpose

    var isValid: Bool {
        !kinds.isEmpty
            && Set(kinds).count == kinds.count
            && (1...MediaImportPolicy.maxMediaCount).contains(maxCount)
    }
}

struct MobileMediaImportResultPayload: Codable, Equatable, Sendable {
    let media: [NativeMediaDescriptor]
}

struct MobileProjectSnapshotV1: Codable, Equatable, Sendable {
    struct QuranSelection: Codable, Equatable, Sendable {
        let surahId: Int
        let surahName: String
        let verseNumbers: [Int]
        let reciterId: String?
    }

    struct Segment: Codable, Equatable, Sendable {
        let id: String
        let verseNumber: Int
        let start: Double
        let end: Double
        let arabic: String
        let translation: String
    }

    struct Style: Codable, Equatable, Sendable {
        let layout: String
        let captionStyle: String
        let arabicSize: Double
        let translationSize: Double
        let overlayOpacity: Double
    }

    let schemaVersion: Int
    let id: String
    let title: String
    let quran: QuranSelection?
    let segments: [Segment]
    let style: Style
    let media: [NativeMediaDescriptor]
    let sourceReferenceURL: String?
    let editorDocumentJSON: String?
    let createdAtMilliseconds: Int64
    let updatedAtMilliseconds: Int64

    init(project: ClipProject, media: [NativeMediaDescriptor]) {
        schemaVersion = 1
        id = project.id.uuidString
        title = project.title
        if let surahId = project.surahID,
           let verseNumbers = project.selectedVerseNumbers,
           !verseNumbers.isEmpty {
            quran = QuranSelection(
                surahId: surahId,
                surahName: project.surahName,
                verseNumbers: verseNumbers,
                reciterId: project.reciterID
            )
        } else {
            quran = nil
        }
        segments = project.segments.map {
            Segment(
                id: $0.id.uuidString,
                verseNumber: $0.verse,
                start: $0.start,
                end: $0.end,
                arabic: $0.arabic ?? project.arabic,
                translation: $0.translation ?? project.translation
            )
        }
        let layout: String
        switch project.layout {
        case .centered: layout = "centered"
        case .sideFade: layout = "sideFade"
        case .lowerThird: layout = "lowerThird"
        }

        let captionStyle: String
        switch project.captionStyle {
        case .softGlow: captionStyle = "softGlow"
        case .crispOutline: captionStyle = "crispOutline"
        case .gold: captionStyle = "gold"
        case .clean: captionStyle = "clean"
        }

        style = Style(
            layout: layout,
            captionStyle: captionStyle,
            arabicSize: project.arabicSize,
            translationSize: project.translationSize,
            overlayOpacity: project.overlayOpacity
        )
        self.media = media
        sourceReferenceURL = project.sourceReferenceURL
        editorDocumentJSON = project.webEditorDocumentJSON
        createdAtMilliseconds = Int64(project.createdAt.timeIntervalSince1970 * 1_000)
        updatedAtMilliseconds = Int64(project.updatedAt.timeIntervalSince1970 * 1_000)
    }

    var isValid: Bool {
        guard schemaVersion == 1,
              UUID(uuidString: id) != nil,
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              segments.allSatisfy({
                  UUID(uuidString: $0.id) != nil
                      && $0.verseNumber > 0
                      && $0.start.isFinite
                      && $0.end.isFinite
                      && $0.start >= 0
                      && $0.end > $0.start
              }),
              zip(segments, segments.dropFirst()).allSatisfy({ $0.end <= $1.start }) else {
            return false
        }
        if let quran {
            guard (1...114).contains(quran.surahId),
                  !quran.verseNumbers.isEmpty,
                  quran.verseNumbers == quran.verseNumbers.sorted(),
                  Set(quran.verseNumbers).count == quran.verseNumbers.count,
                  quran.verseNumbers == segments.map(\.verseNumber) else {
                return false
            }
        }
        let mediaIsValid = media.allSatisfy {
            !$0.id.isEmpty
                && $0.id.utf8.count <= 128
                && NativeMediaRegistry.handle(from: $0.url) == $0.id
                && !$0.contentType.isEmpty
                && $0.fileSize >= 0
        } && Set(media.map(\.id)).count == media.count
        let editorDocumentIsValid = editorDocumentJSON.map {
            Self.isValidEditorDocument($0, projectID: id)
        } ?? true
        return mediaIsValid
            && editorDocumentIsValid
            && style.arabicSize > 0
            && style.translationSize > 0
            && (0...1).contains(style.overlayOpacity)
    }

    private static func isValidEditorDocument(_ json: String, projectID: String) -> Bool {
        let data = Data(json.utf8)
        guard !data.isEmpty,
              data.count <= 1_048_576,
              let object = try? JSONSerialization.jsonObject(with: data),
              let document = object as? [String: Any],
              document["schemaVersion"] as? Int == 1,
              document["projectId"] as? String == projectID,
              document["project"] is [String: Any] else {
            return false
        }
        return !containsEphemeralOrUnsafeURL(object)
    }

    private static func containsEphemeralOrUnsafeURL(_ value: Any) -> Bool {
        if let string = value as? String {
            let lower = string.lowercased()
            return lower.hasPrefix("file:")
                || lower.hasPrefix("blob:")
                || lower.hasPrefix("ayahclip-media:")
                || lower.hasPrefix("javascript:")
                || lower.hasPrefix("data:text/html")
        }
        if let array = value as? [Any] {
            return array.contains(where: containsEphemeralOrUnsafeURL)
        }
        if let dictionary = value as? [String: Any] {
            return dictionary.values.contains(where: containsEphemeralOrUnsafeURL)
        }
        return false
    }
}

enum MobileEditorBridgeContract {
    static let protocolVersion = 1
    static let productionOrigin = URL(string: "https://ayahclip.com")!

    static func productURL(sourceReferenceURL: String? = nil) -> URL {
        var components = URLComponents(
            url: sourceReferenceURL == nil ? productionOrigin : productionOrigin.appending(path: "import"),
            resolvingAgainstBaseURL: false
        )!
        var items = [URLQueryItem(name: "app", value: "ios")]
        if let sourceReferenceURL, !sourceReferenceURL.isEmpty {
            items.append(URLQueryItem(name: "social", value: sourceReferenceURL))
        }
        components.queryItems = items
        return components.url!
    }

    static func editorURL(
        projectID: UUID? = nil,
        requiresPassageSelection: Bool = false
    ) -> URL {
        var components = URLComponents(
            url: productionOrigin.appending(
                path: requiresPassageSelection ? "import" : "studio"
            ),
            resolvingAgainstBaseURL: false
        )!
        var items = [
            URLQueryItem(name: "native", value: "ios"),
            URLQueryItem(name: "bridge", value: String(protocolVersion))
        ]
        if let projectID {
            items.append(URLQueryItem(name: "project", value: projectID.uuidString))
        }
        components.queryItems = items
        return components.url!
    }

    static func allowsNavigation(to url: URL) -> Bool {
        guard url.scheme == "https",
              url.host == "ayahclip.com" || url.host == "www.ayahclip.com" else {
            return false
        }
        // The iPhone app uses the same product routes as ayahclip.com. Keeping
        // navigation same-origin preserves the security boundary without
        // reducing mobile to a separate, incomplete editor shell.
        return true
    }
}
