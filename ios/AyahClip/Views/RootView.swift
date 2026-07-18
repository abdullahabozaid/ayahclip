import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var selections: [PhotosPickerItem] = []
    @State private var watermarkSelections: [PhotosPickerItem] = []
    @State private var showFileImporter = false
    @State private var showWatermarkDisclosure = false
    @State private var showWatermarkPicker = false
    @AppStorage("ayahclip.onboarding.complete") private var onboardingComplete = false

    var body: some View {
        @Bindable var model = model

        TabView(selection: $model.selectedTab) {
            NavigationStack {
                ProjectsView()
            }
            .tag(AppModel.AppTab.projects)
            .tabItem { Label("Projects", systemImage: "rectangle.stack") }

            NavigationStack {
                ImportView(
                    selections: $selections,
                    showFileImporter: $showFileImporter,
                    cleanWatermark: { showWatermarkDisclosure = true }
                )
            }
            .tag(AppModel.AppTab.import)
            .tabItem { Label("Import", systemImage: "plus.circle") }

            NavigationStack {
                SettingsView()
            }
            .tag(AppModel.AppTab.settings)
            .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(AyahTheme.gold)
        .background(AyahTheme.ink)
        .fullScreenCover(item: $model.activeProject) { _ in
            MobileEditorHostView(model: model)
                .environment(model)
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.movie, .video, .audio, .image, .mpeg4Movie, .quickTimeMovie],
            allowsMultipleSelection: true
        ) { result in
            if case let .success(urls) = result {
                Task { await model.importMedia(from: urls) }
            }
        }
        .onChange(of: selections) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var temporaryURLs: [URL] = []
                defer { temporaryURLs.forEach { try? FileManager.default.removeItem(at: $0) } }
                do {
                    var urls: [URL] = []
                    for item in items {
                        guard let imported = try await item.loadTransferable(type: ImportedMedia.self) else {
                            throw CocoaError(.fileReadUnknown)
                        }
                        urls.append(imported.url)
                        temporaryURLs.append(imported.url)
                    }
                    await model.importMedia(from: urls)
                } catch {
                    model.notice = "Could not load that media: \(error.localizedDescription)"
                }
                selections = []
            }
        }
        .confirmationDialog(
            "Clean a watermark",
            isPresented: $showWatermarkDisclosure,
            titleVisibility: .visible
        ) {
            Button("I own it or have permission") { showWatermarkPicker = true }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("AyahClip can blur the two common moving TikTok watermark zones on a video already in your library. Only edit media you own or are allowed to reuse.")
        }
        .photosPicker(
            isPresented: $showWatermarkPicker,
            selection: $watermarkSelections,
            maxSelectionCount: 1,
            matching: .videos
        )
        .onChange(of: watermarkSelections) { _, items in
            guard let item = items.first else { return }
            Task {
                defer { watermarkSelections = [] }
                do {
                    guard let imported = try await item.loadTransferable(type: ImportedMedia.self) else {
                        throw CocoaError(.fileReadUnknown)
                    }
                    defer { try? FileManager.default.removeItem(at: imported.url) }
                    let cleaned = try await WatermarkCleanupService.cleanCommonTikTokZones(
                        sourceURL: imported.url
                    )
                    defer { try? FileManager.default.removeItem(at: cleaned) }
                    if await model.importMedia(from: cleaned) {
                        model.notice = "Watermark zones cleaned on device. Review the result in Studio before exporting."
                    }
                } catch {
                    model.notice = "Could not clean that video: \(error.localizedDescription)"
                }
            }
        }
        .alert("AyahClip", isPresented: Binding(
            get: { model.notice != nil },
            set: { if !$0 { model.notice = nil } }
        )) {
            Button("OK", role: .cancel) { model.notice = nil }
        } message: {
            Text(model.notice ?? "")
        }
        .task { await model.consumeSharedInbox() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await model.consumeSharedInbox() }
            } else {
                // Flush the current draft before suspension; the regular editor
                // path also debounces writes while the user is actively editing.
                model.saveActiveProject()
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

private struct ImportedMedia: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("photos-\(UUID().uuidString).\(received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: destination)
            return Self(url: destination)
        }
        FileRepresentation(contentType: .image) { image in
            SentTransferredFile(image.url)
        } importing: { received in
            let fileExtension = received.file.pathExtension.isEmpty ? "jpg" : received.file.pathExtension
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("photos-\(UUID().uuidString).\(fileExtension)")
            try FileManager.default.copyItem(at: received.file, to: destination)
            return Self(url: destination)
        }
    }
}
