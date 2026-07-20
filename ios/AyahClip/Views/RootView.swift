import Photos
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// AyahClip has one product surface. The website owns navigation, Quran
/// selection, imports, templates, Studio and the project library; iOS adds a
/// secure native export bridge underneath it. This avoids a second mobile UI
/// drifting behind the working product at ayahclip.com.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("ayahclip.onboarding.complete") private var onboardingComplete = false
    @State private var showWatermarkCleanup = false
    @State private var showWatermarkShortcut = true

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if model.activeProject != nil {
                    MobileEditorHostView(
                        model: model,
                        entryPoint: .product,
                        showsCloseButton: false
                    )
                    .id(model.sharedLinkToImport)
                    .environment(model)
                } else {
                    ZStack {
                        Color.black.ignoresSafeArea()
                        ProgressView("Opening AyahClip…")
                            .tint(AyahTheme.gold)
                            .foregroundStyle(.white)
                    }
                    .task {
                        if model.activeProject == nil {
                            model.createProject()
                        }
                    }
                }
            }

            if showWatermarkShortcut {
                HStack(spacing: 8) {
                    Button {
                        showWatermarkShortcut = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(AyahTheme.parchment)
                            .frame(width: 36, height: 36)
                            .background(.black.opacity(0.82), in: Circle())
                    }
                    .accessibilityLabel("Dismiss watermark shortcut")

                    Button {
                        showWatermarkCleanup = true
                    } label: {
                        Image(systemName: "eraser.line.dashed")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Color.black)
                            .frame(width: 48, height: 48)
                            .background(AyahTheme.gold, in: Circle())
                    }
                    .accessibilityLabel("Clean watermark")
                }
                .shadow(color: .black.opacity(0.35), radius: 12, y: 5)
                .padding(.trailing, 16)
                .padding(.bottom, 18)
            }
        }
        .sheet(isPresented: $showWatermarkCleanup) {
            WatermarkCleanupView()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .task {
            await model.consumeSharedInbox()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await model.consumeSharedInbox() }
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { !onboardingComplete },
            set: { if !$0 { onboardingComplete = true } }
        )) {
            OnboardingView { onboardingComplete = true }
        }
    }
}

private struct WatermarkCleanupView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selection: PhotosPickerItem?
    @State private var ownsMedia = false
    @State private var isProcessing = false
    @State private var outputURL: URL?
    @State private var message: String?

    var body: some View {
        let pickerTitle = outputURL == nil ? "Choose a video" : "Choose another video"

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Clean an owned video")
                            .font(.system(size: 28, weight: .semibold, design: .serif))
                            .foregroundStyle(AyahTheme.parchment)
                        Text("Conceals the common moving TikTok watermark zones on device. Review the result before publishing.")
                            .font(.subheadline)
                            .foregroundStyle(AyahTheme.muted)
                    }

                    Toggle("I own this video or have permission to edit it", isOn: $ownsMedia)
                        .tint(AyahTheme.gold)
                        .foregroundStyle(AyahTheme.parchment)

                    PhotosPicker(selection: $selection, matching: .videos) {
                        Label(pickerTitle, systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AyahTheme.gold)
                    .foregroundStyle(.black)
                    .disabled(!ownsMedia || isProcessing)

                    if isProcessing {
                        HStack(spacing: 12) {
                            ProgressView().tint(AyahTheme.gold)
                            Text("Cleaning locally…")
                        }
                        .foregroundStyle(AyahTheme.muted)
                    }

                    if let outputURL {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Cleaned MP4 ready for review", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(Color.green)
                            Button("Save to Photos") {
                                Task { await saveToPhotos(outputURL) }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(AyahTheme.gold)
                            .foregroundStyle(.black)
                            ShareLink(item: outputURL) {
                                Label("Share or open in another app", systemImage: "square.and.arrow.up")
                            }
                            .buttonStyle(.bordered)
                        }
                        .padding(16)
                        .background(AyahTheme.inkDeep, in: RoundedRectangle(cornerRadius: 16))
                    }

                    if let message {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(message.hasPrefix("Saved") ? Color.green : Color.red)
                    }
                }
                .padding(20)
            }
            .background(AyahTheme.ink.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
        .onChange(of: selection) { _, item in
            guard let item else { return }
            Task { await clean(item) }
        }
        .onDisappear {
            if let outputURL { try? FileManager.default.removeItem(at: outputURL) }
        }
    }

    @MainActor
    private func clean(_ item: PhotosPickerItem) async {
        isProcessing = true
        message = nil
        if let outputURL { try? FileManager.default.removeItem(at: outputURL) }
        outputURL = nil
        defer {
            isProcessing = false
            selection = nil
        }
        do {
            guard let imported = try await item.loadTransferable(type: CleanupVideo.self) else {
                throw CocoaError(.fileReadUnknown)
            }
            defer { try? FileManager.default.removeItem(at: imported.url) }
            outputURL = try await WatermarkCleanupService.cleanCommonTikTokZones(
                sourceURL: imported.url
            )
        } catch {
            message = "Could not clean that video: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func saveToPhotos(_ url: URL) async {
        do {
            let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard status == .authorized || status == .limited else {
                message = "Allow Photos access in Settings to save the cleaned video."
                return
            }
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }
            message = "Saved to Photos."
        } catch {
            message = "Could not save to Photos: \(error.localizedDescription)"
        }
    }
}

private struct CleanupVideo: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.url)
        } importing: { received in
            let extensionName = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("watermark-source-\(UUID().uuidString).\(extensionName)")
            try FileManager.default.copyItem(at: received.file, to: destination)
            return Self(url: destination)
        }
    }
}
