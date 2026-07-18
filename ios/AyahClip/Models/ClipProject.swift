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
    var surahName: String
    var verseRange: String
    var arabic: String
    var translation: String
    var mediaFilename: String?
    var bRollFilenames: [String]?
    var sourceReferenceURL: String?
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
