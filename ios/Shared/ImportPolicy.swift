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
