import Foundation

enum MediaImportPolicy {
    static let maxMediaCount = 8
    static let maxSingleMediaBytes: Int64 = 4 * 1_024 * 1_024 * 1_024
    static let storageReserveBytes: Int64 = 1_024 * 1_024 * 1_024

    static func validateBatch(attachedCount: Int, incomingCount: Int) throws {
        guard incomingCount > 0,
              attachedCount >= 0,
              attachedCount + incomingCount <= maxMediaCount else {
            throw MediaImportPolicyError.tooManyFiles
        }
    }

    static func validateFile(fileBytes: Int64, availableBytes: Int64?) throws {
        guard fileBytes >= 0, fileBytes <= maxSingleMediaBytes else {
            throw MediaImportPolicyError.fileTooLarge
        }
        if let availableBytes,
           fileBytes > max(0, availableBytes - storageReserveBytes) {
            throw MediaImportPolicyError.insufficientStorage
        }
    }
}

enum MediaImportPolicyError: LocalizedError {
    case tooManyFiles
    case fileTooLarge
    case insufficientStorage

    var errorDescription: String? {
        switch self {
        case .tooManyFiles:
            "A project can contain up to 8 media clips. Remove a clip before adding more."
        case .fileTooLarge:
            "That source is larger than the 4 GB per-clip limit. Trim or compress it, then try again."
        case .insufficientStorage:
            "This iPhone does not have enough free space to copy that source safely. Free some storage, then try again."
        }
    }
}

enum SocialReferencePolicy {
    static func normalizedURL(from value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.utf8.count <= 16_384 else { return nil }

        if let direct = normalizeCandidate(trimmed) {
            return direct
        }

        guard let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.link.rawValue
        ) else { return nil }
        let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
        for match in detector.matches(in: trimmed, options: [], range: range) {
            guard let url = match.url,
                  let normalized = normalizeCandidate(url.absoluteString) else { continue }
            return normalized
        }
        return nil
    }

    private static func normalizeCandidate(_ value: String) -> URL? {
        guard value.utf8.count <= 2_048,
              var components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              components.user == nil, components.password == nil,
              let host = components.host?.lowercased() else { return nil }

        let supported = ["tiktok.com", "instagram.com", "youtube.com", "youtu.be"].contains {
            host == $0 || host.hasSuffix(".\($0)")
        }
        guard supported, isPostReference(components, host: host) else { return nil }
        components.scheme = scheme
        components.host = host
        components.fragment = nil
        return components.url
    }

    private static func isPostReference(_ components: URLComponents, host: String) -> Bool {
        let pathParts = components.path
            .split(separator: "/", omittingEmptySubsequences: true)
            .map(String.init)
        guard !pathParts.isEmpty else { return false }

        if host == "youtu.be" || host.hasSuffix(".youtu.be") {
            return !pathParts[0].isEmpty
        }

        if host == "youtube.com" || host.hasSuffix(".youtube.com") {
            let route = pathParts[0].lowercased()
            if route == "watch" {
                return components.queryItems?.contains {
                    $0.name.lowercased() == "v" && !($0.value ?? "").isEmpty
                } == true
            }
            return ["shorts", "embed", "live"].contains(route) && pathParts.count >= 2
        }

        if host == "instagram.com" || host.hasSuffix(".instagram.com") {
            let route = pathParts[0].lowercased()
            if ["p", "reel", "reels", "tv"].contains(route) {
                return pathParts.count >= 2
            }
            return route == "share" && pathParts.count >= 3 &&
                ["p", "reel"].contains(pathParts[1].lowercased())
        }

        if host == "tiktok.com" || host.hasSuffix(".tiktok.com") {
            if ["vm.tiktok.com", "vt.tiktok.com"].contains(host) {
                return !pathParts[0].isEmpty
            }
            if pathParts[0].lowercased() == "t" {
                return pathParts.count >= 2
            }
            return pathParts.count >= 3 &&
                pathParts[0].hasPrefix("@") &&
                pathParts[1].lowercased() == "video" &&
                pathParts[2].allSatisfy(\.isNumber)
        }

        return false
    }
}
