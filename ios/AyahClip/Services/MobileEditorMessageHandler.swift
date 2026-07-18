import Foundation
@preconcurrency import WebKit

/// The only JavaScript message entry point exposed to the shared Studio.
/// Web content receives the hydrate envelope as the reply to its typed `ready`
/// message; all later updates are decoded before reaching application state.
final class MobileEditorMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "ayahclipBridge"
    static let maxMessageBytes = 2 * 1_024 * 1_024

    enum MessageError: LocalizedError, Equatable {
        case untrustedFrame
        case malformedMessage
        case oversizedMessage
        case unsupportedMessage

        var errorDescription: String? {
            switch self {
            case .untrustedFrame: "AyahClip rejected a message from an untrusted editor frame."
            case .malformedMessage: "The editor sent a malformed native bridge message."
            case .oversizedMessage: "The editor update is too large to process safely."
            case .unsupportedMessage: "The editor sent an unsupported native bridge message."
            }
        }
    }

    private struct Header: Decodable {
        let protocolVersion: Int
        let id: String
        let type: MobileBridgeMessageType
    }

    private let hydrateReply: Any
    private let onProjectChange: @MainActor (MobileBridgeEnvelope<MobileProjectSnapshotV1>) throws -> Void
    private let exportSession: MobileExportTransferSession
    private let onExportComplete: @MainActor (URL) async throws -> Void
    private let onMediaImportRequest: @MainActor (
        MobileMediaImportRequestPayload
    ) async throws -> MobileMediaImportResultPayload

    @MainActor
    init(
        hydrateEnvelope: MobileBridgeEnvelope<MobileProjectSnapshotV1>,
        onProjectChange: @escaping @MainActor (MobileBridgeEnvelope<MobileProjectSnapshotV1>) throws -> Void,
        onExportComplete: @escaping @MainActor (URL) async throws -> Void = { _ in },
        onMediaImportRequest: @escaping @MainActor (
            MobileMediaImportRequestPayload
        ) async throws -> MobileMediaImportResultPayload = { _ in
            throw MessageError.unsupportedMessage
        }
    ) throws {
        let data = try JSONEncoder().encode(hydrateEnvelope)
        hydrateReply = try JSONSerialization.jsonObject(with: data)
        self.onProjectChange = onProjectChange
        exportSession = MobileExportTransferSession()
        self.onExportComplete = onExportComplete
        self.onMediaImportRequest = onMediaImportRequest
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        do {
            guard message.frameInfo.isMainFrame,
                  let frameURL = message.frameInfo.request.url,
                  MobileEditorBridgeContract.allowsNavigation(to: frameURL) else {
                throw MessageError.untrustedFrame
            }
            let data = try Self.messageData(from: message.body)
            let header = try JSONDecoder().decode(Header.self, from: data)
            guard header.protocolVersion == MobileEditorBridgeContract.protocolVersion,
                  !header.id.isEmpty,
                  header.id.utf8.count <= 128 else {
                throw MessageError.malformedMessage
            }
            switch header.type {
            case .ready:
                replyHandler(hydrateReply, nil)
            case .projectChanged:
                let envelope = try JSONDecoder().decode(
                    MobileBridgeEnvelope<MobileProjectSnapshotV1>.self,
                    from: data
                )
                guard envelope.isSupported, envelope.payload.isValid else {
                    throw MessageError.malformedMessage
                }
                Task { @MainActor [onProjectChange] in
                    do {
                        try onProjectChange(envelope)
                        replyHandler(["accepted": true], nil)
                    } catch {
                        replyHandler(nil, error.localizedDescription)
                    }
                }
            case .requestExport:
                let envelope = try JSONDecoder().decode(
                    MobileBridgeEnvelope<MobileExportRequestPayload>.self,
                    from: data
                )
                Task { @MainActor [exportSession] in
                    do {
                        let ready = try exportSession.begin(envelope.payload)
                        replyHandler(try Self.replyObject(
                            MobileBridgeEnvelope(type: .exportReady, payload: ready)
                        ), nil)
                    } catch {
                        replyHandler(nil, error.localizedDescription)
                    }
                }
            case .requestMediaImport:
                let envelope = try JSONDecoder().decode(
                    MobileBridgeEnvelope<MobileMediaImportRequestPayload>.self,
                    from: data
                )
                guard envelope.payload.isValid else { throw MessageError.malformedMessage }
                Task { @MainActor [onMediaImportRequest] in
                    do {
                        let result = try await onMediaImportRequest(envelope.payload)
                        replyHandler(try Self.replyObject(
                            MobileBridgeEnvelope(type: .mediaImported, payload: result)
                        ), nil)
                    } catch {
                        replyHandler(nil, error.localizedDescription)
                    }
                }
            case .exportChunk:
                let envelope = try JSONDecoder().decode(
                    MobileBridgeEnvelope<MobileExportChunkPayload>.self,
                    from: data
                )
                Task { @MainActor [exportSession] in
                    do {
                        try exportSession.append(envelope.payload)
                        replyHandler(["accepted": true], nil)
                    } catch {
                        replyHandler(nil, error.localizedDescription)
                    }
                }
            case .exportComplete:
                let envelope = try JSONDecoder().decode(
                    MobileBridgeEnvelope<MobileExportControlPayload>.self,
                    from: data
                )
                Task { @MainActor [exportSession, onExportComplete] in
                    do {
                        let (url, ready) = try exportSession.complete(envelope.payload)
                        do {
                            try await onExportComplete(url)
                        } catch {
                            try? FileManager.default.removeItem(at: url)
                            throw error
                        }
                        replyHandler(try Self.replyObject(
                            MobileBridgeEnvelope(type: .exportReady, payload: ready)
                        ), nil)
                    } catch {
                        replyHandler(nil, error.localizedDescription)
                    }
                }
            case .exportCancel:
                let envelope = try JSONDecoder().decode(
                    MobileBridgeEnvelope<MobileExportControlPayload>.self,
                    from: data
                )
                Task { @MainActor [exportSession] in
                    do {
                        let ready = try exportSession.cancel(envelope.payload)
                        replyHandler(try Self.replyObject(
                            MobileBridgeEnvelope(type: .exportReady, payload: ready)
                        ), nil)
                    } catch {
                        replyHandler(nil, error.localizedDescription)
                    }
                }
            default:
                throw MessageError.unsupportedMessage
            }
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }

    static func messageData(from body: Any) throws -> Data {
        guard JSONSerialization.isValidJSONObject(body) else {
            throw MessageError.malformedMessage
        }
        let data = try JSONSerialization.data(withJSONObject: body)
        guard data.count <= maxMessageBytes else { throw MessageError.oversizedMessage }
        return data
    }

    @MainActor
    func close() {
        exportSession.close()
    }

    private static func replyObject<Payload: Codable & Equatable>(
        _ envelope: MobileBridgeEnvelope<Payload>
    ) throws -> Any {
        let data = try JSONEncoder().encode(envelope)
        return try JSONSerialization.jsonObject(with: data)
    }
}
