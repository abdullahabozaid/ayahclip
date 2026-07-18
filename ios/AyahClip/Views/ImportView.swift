import PhotosUI
import SwiftUI

struct ImportView: View {
    @Environment(AppModel.self) private var model
    @Binding var selection: PhotosPickerItem?
    @Binding var showFileImporter: Bool

    var body: some View {
        @Bindable var model = model

        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Bring your media")
                        .font(.system(size: 30, weight: .semibold, design: .serif))
                        .foregroundStyle(AyahTheme.parchment)
                    Text("Choose an original video or audio file you own. Processing stays on device.")
                        .font(.subheadline)
                        .foregroundStyle(AyahTheme.muted)
                }

                VStack(spacing: 12) {
                    PhotosPicker(selection: $selection, matching: .videos) {
                        ImportAction(title: "Choose from Photos", detail: "Videos in your library", icon: "photo.on.rectangle")
                    }
                    Button { showFileImporter = true } label: {
                        ImportAction(title: "Browse Files", detail: "Video or recitation audio", icon: "folder")
                    }
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Reference a post")
                        .font(.headline)
                        .foregroundStyle(AyahTheme.parchment)
                    TextField("Paste TikTok, Instagram, or YouTube link", text: $model.pendingLink)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .padding(.horizontal, 14)
                        .frame(minHeight: 50)
                        .background(AyahTheme.inkDeep)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(AyahTheme.hairline, lineWidth: 1)
                        }
                    Button("Save reference") { model.referenceLink() }
                        .buttonStyle(.borderedProminent)
                        .tint(AyahTheme.gold)
                        .foregroundStyle(AyahTheme.inkDeep)
                    Text("AyahClip does not download other creators’ posts or remove platform watermarks. Use the original file you own, then export a clean edit.")
                        .font(.caption)
                        .foregroundStyle(AyahTheme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(18)
                .ayahPanel()

                if model.isImporting {
                    HStack(spacing: 12) {
                        ProgressView().tint(AyahTheme.gold)
                        Text("Copying media to your private project…")
                            .font(.subheadline)
                            .foregroundStyle(AyahTheme.muted)
                    }
                }
            }
            .padding(20)
        }
        .background(AyahTheme.ink.overlay(AyahTheme.background).ignoresSafeArea())
        .navigationBarHidden(true)
    }
}

private struct ImportAction: View {
    let title: String
    let detail: String
    let icon: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(AyahTheme.goldSoft)
                .frame(width: 48, height: 48)
                .background(AyahTheme.inkDeep)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline).foregroundStyle(AyahTheme.parchment)
                Text(detail).font(.caption).foregroundStyle(AyahTheme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(AyahTheme.muted)
        }
        .padding(14)
        .ayahPanel()
    }
}

