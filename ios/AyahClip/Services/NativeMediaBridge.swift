import Foundation
import UniformTypeIdentifiers

struct NativeMediaDescriptor: Codable, Equatable, Sendable {
    let id: String
    let url: URL
    let contentType: String
    let fileSize: Int64
}

struct NativeMediaResponsePlan: Equatable, Sendable {
    let statusCode: Int
    let offset: Int64
    let length: Int64
    let headers: [String: String]
}

final class NativeMediaRegistry: @unchecked Sendable {
    enum RegistryError: LocalizedError {
        case outsidePrivateStorage
        case unsupportedType
        case missingFile
        case invalidHandle
        case invalidRange

        var errorDescription: String? {
            switch self {
            case .outsidePrivateStorage:
                "AyahClip refused to expose a file outside its private media directory."
            case .unsupportedType:
                "That file type cannot be streamed into the editor."
            case .missingFile:
                "That imported file is no longer available on this iPhone."
            case .invalidHandle:
                "The editor requested an unknown local media item."
            case .invalidRange:
                "The editor requested an invalid media byte range."
            }
        }
    }

    private struct Entry {
        let url: URL
        let contentType: String
        let fileSize: Int64
    }

    private let allowedRoots: [URL]
    private let lock = NSLock()
    private var entries: [String: Entry] = [:]

    init(allowedRoots: [URL]) {
        self.allowedRoots = allowedRoots.map(Self.canonicalURL)
    }

    func register(_ sourceURL: URL) throws -> NativeMediaDescriptor {
        let url = Self.canonicalURL(sourceURL)
        guard allowedRoots.contains(where: { Self.contains(url, in: $0) }) else {
            throw RegistryError.outsidePrivateStorage
        }
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw RegistryError.missingFile
        }
        guard let type = UTType(filenameExtension: url.pathExtension),
              type.conforms(to: .image)
                || type.conforms(to: .audio)
                || type.conforms(to: .movie)
                || type.conforms(to: .video) else {
            throw RegistryError.unsupportedType
        }
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard values.isRegularFile == true else { throw RegistryError.missingFile }
        let fileSize = Int64(values.fileSize ?? 0)
        let handle = UUID().uuidString.lowercased()
        lock.withLock {
            entries[handle] = Entry(
                url: url,
                contentType: type.preferredMIMEType ?? "application/octet-stream",
                fileSize: fileSize
            )
        }
        return NativeMediaDescriptor(
            id: handle,
            url: URL(string: "ayahclip-media://asset/\(handle)")!,
            contentType: type.preferredMIMEType ?? "application/octet-stream",
            fileSize: fileSize
        )
    }

    func revokeAll() {
        lock.withLock { entries.removeAll() }
    }

    func revoke(handles: [String]) {
        lock.withLock {
            for handle in handles { entries.removeValue(forKey: handle) }
        }
    }

    func responsePlan(handle: String, rangeHeader: String?) throws -> NativeMediaResponsePlan {
        guard handle.utf8.count <= 128,
              let entry = lock.withLock({ entries[handle] }) else {
            throw RegistryError.invalidHandle
        }
        guard entry.fileSize > 0 else { throw RegistryError.missingFile }
        var headers = [
            "Accept-Ranges": "bytes",
            "Content-Type": entry.contentType,
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "https://ayahclip.com",
            "Cross-Origin-Resource-Policy": "cross-origin"
        ]
        guard let rangeHeader, !rangeHeader.isEmpty else {
            headers["Content-Length"] = String(entry.fileSize)
            return NativeMediaResponsePlan(
                statusCode: 200,
                offset: 0,
                length: entry.fileSize,
                headers: headers
            )
        }
        guard let range = Self.parseRange(rangeHeader, fileSize: entry.fileSize) else {
            throw RegistryError.invalidRange
        }
        let length = range.upperBound - range.lowerBound + 1
        headers["Content-Length"] = String(length)
        headers["Content-Range"] = "bytes \(range.lowerBound)-\(range.upperBound)/\(entry.fileSize)"
        return NativeMediaResponsePlan(
            statusCode: 206,
            offset: range.lowerBound,
            length: length,
            headers: headers
        )
    }

    func read(handle: String, plan: NativeMediaResponsePlan) throws -> Data {
        var data = Data()
        try stream(handle: handle, plan: plan) { data.append($0) }
        return data
    }

    func stream(
        handle: String,
        plan: NativeMediaResponsePlan,
        chunkSize: Int = 256 * 1_024,
        shouldContinue: () -> Bool = { true },
        consume: (Data) throws -> Void
    ) throws {
        guard let entry = lock.withLock({ entries[handle] }) else {
            throw RegistryError.invalidHandle
        }
        guard chunkSize > 0, plan.offset >= 0, plan.length >= 0,
              plan.offset + plan.length <= entry.fileSize else {
            throw RegistryError.invalidRange
        }
        let file = try FileHandle(forReadingFrom: entry.url)
        defer { try? file.close() }
        try file.seek(toOffset: UInt64(plan.offset))
        var remaining = plan.length
        while remaining > 0, shouldContinue() {
            let count = Int(min(Int64(chunkSize), remaining))
            guard let chunk = try file.read(upToCount: count), !chunk.isEmpty else {
                throw RegistryError.missingFile
            }
            try consume(chunk)
            remaining -= Int64(chunk.count)
        }
    }

    static func handle(from url: URL) -> String? {
        guard url.scheme == "ayahclip-media", url.host == "asset" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 1, parts[0].utf8.count <= 128 else { return nil }
        return parts[0]
    }

    private static func parseRange(_ header: String, fileSize: Int64) -> ClosedRange<Int64>? {
        guard fileSize > 0,
              header.hasPrefix("bytes="),
              !header.contains(",") else { return nil }
        let value = String(header.dropFirst("bytes=".count))
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        if parts[0].isEmpty {
            guard let suffix = Int64(parts[1]), suffix > 0 else { return nil }
            let lower = max(0, fileSize - suffix)
            return lower...(fileSize - 1)
        }
        guard let lower = Int64(parts[0]), lower >= 0, lower < fileSize else { return nil }
        if parts[1].isEmpty { return lower...(fileSize - 1) }
        guard let requestedUpper = Int64(parts[1]), requestedUpper >= lower else { return nil }
        return lower...min(requestedUpper, fileSize - 1)
    }

    private static func canonicalURL(_ url: URL) -> URL {
        url.standardizedFileURL.resolvingSymlinksInPath()
    }

    private static func contains(_ file: URL, in root: URL) -> Bool {
        file.path == root.path || file.path.hasPrefix(root.path + "/")
    }
}
