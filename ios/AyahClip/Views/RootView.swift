import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var selections: [PhotosPickerItem] = []
    @State private var showFileImporter = false
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
                ImportView(selections: $selections, showFileImporter: $showFileImporter)
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
            EditorView()
                .environment(model)
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.movie, .video, .audio, .mpeg4Movie, .quickTimeMovie],
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
                        guard let imported = try await item.loadTransferable(type: ImportedMovie.self) else {
                            throw CocoaError(.fileReadUnknown)
                        }
                        urls.append(imported.url)
                        temporaryURLs.append(imported.url)
                    }
                    await model.importMedia(from: urls)
                } catch {
                    model.notice = "Could not load those videos: \(error.localizedDescription)"
                }
                selections = []
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

private struct ImportedMovie: Transferable {
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
    }
}
