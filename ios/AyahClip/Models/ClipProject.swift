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
}

struct ClipProject: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
    var surahName: String
    var verseRange: String
    var arabic: String
    var translation: String
    var mediaFilename: String?
    var createdAt = Date()
    var updatedAt = Date()
    var arabicSize: Double = 36
    var translationSize: Double = 15
    var overlayOpacity: Double = 0.35
    var layout: ClipLayout = .centered
    var captionStyle: CaptionStyle = .softGlow
    var selectedTool: EditorTool = .captions
    var segments: [VerseSegment] = [
        VerseSegment(verse: 1, start: 0, end: 5),
        VerseSegment(verse: 2, start: 5, end: 11),
        VerseSegment(verse: 3, start: 11, end: 16)
    ]

    static let starter = ClipProject(
        title: "Al-Mulk 1-3",
        surahName: "Surah Al-Mulk",
        verseRange: "Verses 1-3",
        arabic: "تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        translation: "Blessed is He in whose hand is dominion, and He is over all things competent."
    )
}
