import Foundation

struct QuranChapter: Codable, Equatable, Identifiable, Sendable {
    struct TranslatedName: Codable, Equatable, Sendable {
        let name: String
        let languageName: String

        enum CodingKeys: String, CodingKey {
            case name
            case languageName = "language_name"
        }
    }

    let id: Int
    let nameSimple: String
    let nameArabic: String
    let versesCount: Int
    let revelationPlace: String
    let translatedName: TranslatedName

    enum CodingKeys: String, CodingKey {
        case id
        case nameSimple = "name_simple"
        case nameArabic = "name_arabic"
        case versesCount = "verses_count"
        case revelationPlace = "revelation_place"
        case translatedName = "translated_name"
    }
}

struct QuranCatalogVerse: Codable, Equatable, Identifiable, Sendable {
    struct Translation: Codable, Equatable, Sendable {
        let text: String?
    }

    let id: Int
    let verseNumber: Int
    let verseKey: String
    let textUthmani: String
    let translations: [Translation]?

    enum CodingKeys: String, CodingKey {
        case id
        case verseNumber = "verse_number"
        case verseKey = "verse_key"
        case textUthmani = "text_uthmani"
        case translations
    }

    var cleanTranslation: String {
        Self.cleanHTML(translations?.first?.text ?? "")
    }

    private static func cleanHTML(_ value: String) -> String {
        value
            .replacingOccurrences(
                of: #"<sup[^>]*>.*?</sup>"#,
                with: "",
                options: [.regularExpression, .caseInsensitive]
            )
            .replacingOccurrences(of: #"<[^>]*>"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct QuranCatalogService: Sendable {
    typealias DataLoader = @Sendable (URL) async throws -> Data

    enum CatalogError: LocalizedError {
        case invalidRequest
        case invalidResponse
        case unavailable(Int)
        case invalidChapter(Int)

        var errorDescription: String? {
            switch self {
            case .invalidRequest:
                "AyahClip could not create a secure Quran catalog request."
            case .invalidResponse:
                "The Quran catalog returned data AyahClip could not verify. Try again shortly."
            case let .unavailable(status):
                "The Quran catalog is unavailable (HTTP \(status)). Try again shortly."
            case let .invalidChapter(chapter):
                "Surah \(chapter) is outside the Quran's 1 to 114 range."
            }
        }
    }

    private let loadData: DataLoader
    private let baseURL = URL(string: "https://api.quran.com/api/v4")!

    init(loadData: @escaping DataLoader = Self.liveLoader) {
        self.loadData = loadData
    }

    func fetchChapters() async throws -> [QuranChapter] {
        let url = baseURL.appending(path: "chapters").appending(queryItems: [
            URLQueryItem(name: "language", value: "en")
        ])
        let response = try JSONDecoder().decode(ChapterResponse.self, from: try await loadData(url))
        guard response.chapters.count == 114,
              response.chapters.map(\.id) == Array(1...114),
              response.chapters.allSatisfy({ $0.versesCount > 0 }) else {
            throw CatalogError.invalidResponse
        }
        return response.chapters
    }

    func fetchVerses(chapter: Int, translationResource: Int = 20) async throws -> [QuranCatalogVerse] {
        guard (1...114).contains(chapter) else { throw CatalogError.invalidChapter(chapter) }
        let url = baseURL
            .appending(path: "verses/by_chapter/\(chapter)")
            .appending(queryItems: [
                URLQueryItem(name: "language", value: "en"),
                URLQueryItem(name: "translations", value: String(translationResource)),
                URLQueryItem(name: "fields", value: "text_uthmani"),
                URLQueryItem(name: "per_page", value: "300")
            ])
        let response = try JSONDecoder().decode(VerseResponse.self, from: try await loadData(url))
        guard !response.verses.isEmpty,
              response.verses.map(\.verseNumber) == Array(1...response.verses.count),
              response.verses.allSatisfy({ !$0.textUthmani.isEmpty && $0.verseKey.hasPrefix("\(chapter):") }) else {
            throw CatalogError.invalidResponse
        }
        return response.verses
    }

    private struct ChapterResponse: Decodable {
        let chapters: [QuranChapter]
    }

    private struct VerseResponse: Decodable {
        let verses: [QuranCatalogVerse]
    }

    private static func liveLoader(url: URL) async throws -> Data {
        guard url.scheme == "https", url.host == "api.quran.com" else {
            throw CatalogError.invalidRequest
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw CatalogError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw CatalogError.unavailable(http.statusCode)
        }
        return data
    }
}
