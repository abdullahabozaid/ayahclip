import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection: PhotosPickerItem?
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
                ImportView(selection: $selection, showFileImporter: $showFileImporter)
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
            allowedContentTypes: [.movie, .video, .audio, .mpeg4Movie, .quickTimeMovie]
        ) { result in
            if case let .success(url) = result {
                Task { await model.importMedia(from: url) }
            }
        }
        .onChange(of: selection) { _, item in
            guard let item else { return }
            Task {
                do {
                    guard let imported = try await item.loadTransferable(type: ImportedMovie.self) else {
                        model.notice = "That Photos item could not be loaded."
                        return
                    }
                    await model.importMedia(from: imported.url)
                } catch {
                    model.notice = "Could not load that video: \(error.localizedDescription)"
                }
                selection = nil
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
