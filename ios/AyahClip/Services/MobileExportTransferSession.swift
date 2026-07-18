import Foundation

@MainActor
final class MobileExportTransferSession {
    static let chunkSize = 512 * 1_024
    static let maxFileSize: Int64 = 500 * 1_024 * 1_024

    enum TransferError: LocalizedError, Equatable {
        case alreadyActive
        case invalidMetadata
        case invalidChunk
        case outOfOrder
        case incomplete
        case unknownExport

        var errorDescription: String? {
            switch self {
            case .alreadyActive: "Finish or cancel the current export before starting another."
            case .invalidMetadata: "The rendered video metadata is invalid or unsupported."
            case .invalidChunk: "The rendered video contained an invalid transfer chunk."
            case .outOfOrder: "The rendered video arrived out of order. Please export again."
            case .incomplete: "The rendered video transfer ended before every byte arrived."
            case .unknownExport: "That rendered video transfer is no longer active."
            }
        }
    }

    private struct ActiveTransfer {
        let id: String
        let fileName: String
        let fileSize: Int64
        let totalChunks: Int
        let url: URL
        let handle: FileHandle
        var nextIndex: Int
        var receivedBytes: Int64
    }

    private var active: ActiveTransfer?

    func begin(_ payload: MobileExportRequestPayload) throws -> MobileExportReadyPayload {
        guard active == nil else { throw TransferError.alreadyActive }
        let safeName = URL(fileURLWithPath: payload.fileName).lastPathComponent
        let ext = URL(fileURLWithPath: safeName).pathExtension.lowercased()
        let typeMatchesExtension = ext == "mp4" && payload.mimeType == "video/mp4"
        let expectedChunks = Int(
            (payload.fileSize + Int64(Self.chunkSize) - 1) / Int64(Self.chunkSize)
        )
        guard !safeName.isEmpty,
              !safeName.hasPrefix("."),
              safeName.utf8.count <= 180,
              ext == "mp4",
              typeMatchesExtension,
              payload.fileSize > 0,
              payload.fileSize <= Self.maxFileSize,
              payload.totalChunks == expectedChunks else {
            throw TransferError.invalidMetadata
        }

        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AyahClipWebExports", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let id = UUID().uuidString.lowercased()
        let url = directory.appendingPathComponent("\(id).\(ext)")
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else {
            throw CocoaError(.fileWriteUnknown)
        }
        let handle = try FileHandle(forWritingTo: url)
        active = ActiveTransfer(
            id: id,
            fileName: safeName,
            fileSize: payload.fileSize,
            totalChunks: payload.totalChunks,
            url: url,
            handle: handle,
            nextIndex: 0,
            receivedBytes: 0
        )
        return MobileExportReadyPayload(
            exportId: id,
            status: .ready,
            chunkSize: Self.chunkSize,
            fileName: nil
        )
    }

    func append(_ payload: MobileExportChunkPayload) throws {
        guard var transfer = active, transfer.id == payload.exportId else {
            throw TransferError.unknownExport
        }
        guard payload.totalChunks == transfer.totalChunks,
              payload.index >= 0,
              payload.index < transfer.totalChunks else {
            throw TransferError.invalidChunk
        }
        guard payload.index == transfer.nextIndex else { throw TransferError.outOfOrder }
        guard let data = Data(base64Encoded: payload.base64Data),
              !data.isEmpty,
              data.count <= Self.chunkSize,
              transfer.receivedBytes + Int64(data.count) <= transfer.fileSize else {
            throw TransferError.invalidChunk
        }
        try transfer.handle.write(contentsOf: data)
        transfer.receivedBytes += Int64(data.count)
        transfer.nextIndex += 1
        active = transfer
    }

    func complete(_ payload: MobileExportControlPayload) throws -> (URL, MobileExportReadyPayload) {
        guard let transfer = active, transfer.id == payload.exportId else {
            throw TransferError.unknownExport
        }
        guard payload.totalChunks == transfer.totalChunks,
              transfer.nextIndex == transfer.totalChunks,
              transfer.receivedBytes == transfer.fileSize else {
            throw TransferError.incomplete
        }
        try transfer.handle.synchronize()
        try transfer.handle.close()
        active = nil
        return (
            transfer.url,
            MobileExportReadyPayload(
                exportId: transfer.id,
                status: .complete,
                chunkSize: Self.chunkSize,
                fileName: transfer.fileName
            )
        )
    }

    func cancel(_ payload: MobileExportControlPayload) throws -> MobileExportReadyPayload {
        guard let transfer = active, transfer.id == payload.exportId else {
            throw TransferError.unknownExport
        }
        try? transfer.handle.close()
        try? FileManager.default.removeItem(at: transfer.url)
        active = nil
        return MobileExportReadyPayload(
            exportId: transfer.id,
            status: .cancelled,
            chunkSize: Self.chunkSize,
            fileName: nil
        )
    }

    func close() {
        guard let transfer = active else { return }
        try? transfer.handle.close()
        try? FileManager.default.removeItem(at: transfer.url)
        active = nil
    }
}
