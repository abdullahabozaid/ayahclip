import Foundation

enum EditorTool: String, CaseIterable, Identifiable, Codable {
    case edit = "Edit"
    case captions = "Captions"
    case style = "Style"
    case media = "Media"
    case export = "Export"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .edit: "slider.horizontal.3"
        case .captions: "captions.bubble"
        case .style: "paintpalette"
        case .media: "photo.on.rectangle.angled"
        case .export: "square.and.arrow.up"
        }
    }
}

enum ClipLayout: String, CaseIterable, Identifiable, Codable {
    case centered = "Centered"
    case sideFade = "Side fade"
    case lowerThird = "Lower third"

    var id: String { rawValue }
}

enum CaptionStyle: String, CaseIterable, Identifiable, Codable {
    case softGlow = "Soft glow"
    case crispOutline = "Crisp outline"
    case gold = "Gold"
    case clean = "Clean"

    var id: String { rawValue }
}

struct VerseSegment: Identifiable, Codable, Equatable {
    var id = UUID()
    var verse: Int
    var start: Double
    var end: Double
    var arabic: String?
    var translation: String?
}

struct CaptionContent: Equatable {
    var arabic: String
    var translation: String
}

struct ClipProject: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
    var surahID: Int?
    var surahName: String
    var verseRange: String
    var selectedVerseNumbers: [Int]?
    var reciterID: String?
    var arabic: String
    var translation: String
    var mediaFilename: String?
    var bRollFilenames: [String]?
    /// Optional per-source durations, currently used by still images. Kept
    /// optional so projects written by the first TestFlight build continue to
    /// decode without a migration step.
    var mediaDurations: [String: Double]?
    var sourceReferenceURL: String?
    /// Versioned web-editor document. The shared Studio owns this richer state
    /// so native round-trips never flatten templates, masks, animation or media
    /// composition into the prototype's smaller Swift style model.
    var webEditorDocumentJSON: String?
    var createdAt = Date()
    var updatedAt = Date()
    var arabicSize: Double = 36
    var translationSize: Double = 15
    var overlayOpacity: Double = 0.35
    var layout: ClipLayout = .centered
    var captionStyle: CaptionStyle = .softGlow
    var selectedTool: EditorTool = .captions
    var segments: [VerseSegment] = [
        VerseSegment(
            verse: 1,
            start: 0,
            end: 5,
            arabic: "تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
            translation: "Blessed is He in whose hand is dominion, and He is over all things competent."
        ),
        VerseSegment(
            verse: 2,
            start: 5,
            end: 11,
            arabic: "الَّذِي خَلَقَ الْمَوْتَ وَالْحَيَاةَ لِيَبْلُوَكُمْ أَيُّكُمْ أَحْسَنُ عَمَلًا وَهُوَ الْعَزِيزُ الْغَفُورُ",
            translation: "He who created death and life to test you as to which of you is best in deed—and He is the Almighty, the Most Forgiving."
        ),
        VerseSegment(
            verse: 3,
            start: 11,
            end: 16,
            arabic: "الَّذِي خَلَقَ سَبْعَ سَمَاوَاتٍ طِبَاقًا مَا تَرَىٰ فِي خَلْقِ الرَّحْمَٰنِ مِن تَفَاوُتٍ فَارْجِعِ الْبَصَرَ هَلْ تَرَىٰ مِن فُطُورٍ",
            translation: "He who created seven heavens in layers. You do not see any inconsistency in the creation of the Most Compassionate. Look again—do you see any flaws?"
        )
    ]

    static let starter = ClipProject(
        title: "Al-Mulk 1-3",
        surahName: "Surah Al-Mulk",
        verseRange: "Verses 1-3",
        arabic: "تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        translation: "Blessed is He in whose hand is dominion, and He is over all things competent."
    )

    static func freshStarter() -> ClipProject {
        var project = starter
        project.id = UUID()
        project.createdAt = Date()
        project.updatedAt = project.createdAt
        project.segments = project.segments.map { segment in
            var copy = segment
            copy.id = UUID()
            return copy
        }
        return project
    }

    /// A real creator project must not inherit the prototype's Al-Mulk sample.
    /// The shared import route will populate Quran selection and aligned
    /// segments only after recognition or explicit manual confirmation.
    static func freshDraft() -> ClipProject {
        var project = freshStarter()
        project.title = "Untitled Quran clip"
        project.surahID = nil
        project.surahName = "Passage not selected"
        project.verseRange = "Choose verses"
        project.selectedVerseNumbers = nil
        project.reciterID = nil
        project.arabic = ""
        project.translation = ""
        project.segments = []
        return project
    }

    /// Build 1 wrote the untouched demonstration passage into every new
    /// project while leaving its Quran selection nil. Remove only an exact
    /// untouched placeholder; any creator change makes the project ineligible.
    func removingLegacyPlaceholderIfNeeded() -> ClipProject {
        let placeholder = Self.starter
        let hasPlaceholderIdentity = surahID == nil
            && selectedVerseNumbers == nil
            && title == placeholder.title
            && surahName == placeholder.surahName
            && verseRange == placeholder.verseRange
            && arabic == placeholder.arabic
            && translation == placeholder.translation
        let hasPlaceholderSegments = segments.count == placeholder.segments.count
            && zip(segments, placeholder.segments).allSatisfy { current, expected in
                current.verse == expected.verse
                    && current.start == expected.start
                    && current.end == expected.end
                    && current.arabic == expected.arabic
                    && current.translation == expected.translation
            }
        guard hasPlaceholderIdentity, hasPlaceholderSegments else { return self }

        var migrated = self
        migrated.title = "Untitled Quran clip"
        migrated.surahName = "Passage not selected"
        migrated.verseRange = "Choose verses"
        migrated.arabic = ""
        migrated.translation = ""
        migrated.segments = []
        return migrated
    }

    var allMediaFilenames: [String] {
        ([mediaFilename].compactMap { $0 } + (bRollFilenames ?? []))
            .reduce(into: []) { filenames, filename in
                if !filenames.contains(filename) { filenames.append(filename) }
            }
    }

    mutating func setMediaFilenames(_ filenames: [String]) {
        mediaFilename = filenames.first
        let bRoll = Array(filenames.dropFirst())
        bRollFilenames = bRoll.isEmpty ? nil : bRoll
        if var durations = mediaDurations {
            durations = durations.filter { filenames.contains($0.key) }
            mediaDurations = durations.isEmpty ? nil : durations
        }
    }

    var fallbackVisualDuration: Double {
        max(8, segments.map(\.end).max() ?? 0)
    }

    func mediaDuration(for filename: String) -> Double {
        guard let duration = mediaDurations?[filename], duration.isFinite, duration > 0 else {
            return fallbackVisualDuration
        }
        return duration
    }

    mutating func setMediaDuration(_ duration: Double, for filename: String) {
        guard duration.isFinite, duration > 0 else { return }
        var durations = mediaDurations ?? [:]
        durations[filename] = duration
        mediaDurations = durations
    }

    mutating func applyQuranRange(
        chapter: QuranChapter,
        verses: [QuranCatalogVerse]
    ) {
        let ordered = verses.sorted { $0.verseNumber < $1.verseNumber }
        guard let first = ordered.first,
              let last = ordered.last,
              ordered.allSatisfy({ $0.verseKey.hasPrefix("\(chapter.id):") }),
              zip(ordered, ordered.dropFirst()).allSatisfy({ $1.verseNumber == $0.verseNumber + 1 }) else {
            return
        }

        surahID = chapter.id
        surahName = "Surah \(chapter.nameSimple)"
        selectedVerseNumbers = ordered.map(\.verseNumber)
        let compactRange = first.verseNumber == last.verseNumber
            ? "Verse \(first.verseNumber)"
            : "Verses \(first.verseNumber)-\(last.verseNumber)"
        verseRange = compactRange
        title = first.verseNumber == last.verseNumber
            ? "\(chapter.nameSimple) \(first.verseNumber)"
            : "\(chapter.nameSimple) \(first.verseNumber)-\(last.verseNumber)"
        arabic = first.textUthmani
        translation = first.cleanTranslation

        let existingDuration = max(fallbackVisualDuration, Double(ordered.count) * 4)
        let segmentDuration = existingDuration / Double(ordered.count)
        segments = ordered.enumerated().map { index, verse in
            let start = Double(index) * segmentDuration
            return VerseSegment(
                verse: verse.verseNumber,
                start: start,
                end: index == ordered.count - 1 ? existingDuration : start + segmentDuration,
                arabic: verse.textUthmani,
                translation: verse.cleanTranslation
            )
        }
        updatedAt = Date()
    }

    func captions(at seconds: Double) -> CaptionContent? {
        guard !segments.isEmpty else {
            return CaptionContent(arabic: arabic, translation: translation)
        }
        guard let segment = segments.first(where: { seconds >= $0.start && seconds < $0.end }) else {
            return nil
        }
        return CaptionContent(
            arabic: segment.arabic ?? arabic,
            translation: segment.translation ?? translation
        )
    }

    mutating func fitSegments(to duration: Double) {
        guard duration.isFinite, duration > 0, let currentEnd = segments.map(\.end).max(), currentEnd > 0 else {
            return
        }
        let scale = duration / currentEnd
        for index in segments.indices {
            segments[index].start *= scale
            segments[index].end *= scale
        }
        segments[segments.index(before: segments.endIndex)].end = duration
    }

    mutating func splitSegment(id: UUID, at seconds: Double) -> UUID? {
        guard let index = segments.firstIndex(where: { $0.id == id }) else { return nil }
        let segment = segments[index]
        guard seconds > segment.start + 0.2, seconds < segment.end - 0.2 else { return nil }

        segments[index].end = seconds
        for laterIndex in segments.indices where laterIndex > index {
            segments[laterIndex].verse += 1
        }
        let newSegment = VerseSegment(
            verse: segment.verse + 1,
            start: seconds,
            end: segment.end,
            arabic: "",
            translation: ""
        )
        segments.insert(newSegment, at: index + 1)
        return newSegment.id
    }

    mutating func removeSegment(id: UUID) -> UUID? {
        guard segments.count > 1,
              let index = segments.firstIndex(where: { $0.id == id }) else { return nil }
        let removed = segments.remove(at: index)
        if index > 0 {
            segments[index - 1].end = removed.end
        } else if !segments.isEmpty {
            segments[0].start = removed.start
        }
        for segmentIndex in segments.indices {
            segments[segmentIndex].verse = segmentIndex + 1
        }
        return segments[min(index, segments.count - 1)].id
    }
}
