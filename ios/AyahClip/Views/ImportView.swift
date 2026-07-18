import PhotosUI
import SwiftUI

struct ImportView: View {
    @Environment(AppModel.self) private var model
    @Binding var selections: [PhotosPickerItem]
    @Binding var showFileImporter: Bool
    let cleanWatermark: () -> Void

    var body: some View {
        @Bindable var model = model

        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Bring your media")
                        .font(.system(size: 30, weight: .semibold, design: .serif))
                        .foregroundStyle(AyahTheme.parchment)
                    Text("Start with your recitation or original video, then add B-roll. Processing stays on device.")
                        .font(.subheadline)
                        .foregroundStyle(AyahTheme.muted)
                }

                VStack(spacing: 12) {
                    PhotosPicker(
                        selection: $selections,
                        maxSelectionCount: 8,
                        matching: .any(of: [.images, .videos])
                    ) {
                        ImportAction(
                            title: "Choose photos or videos",
                            detail: "Select up to 8 original visuals or B-roll items",
                            icon: "photo.on.rectangle"
                        )
                    }
                    Button { showFileImporter = true } label: {
                        ImportAction(title: "Browse Files", detail: "Recitation audio, photos, and videos", icon: "folder")
                    }
                    Button(action: cleanWatermark) {
                        ImportAction(
                            title: "Clean a watermark",
                            detail: "For videos you own · processed on device",
                            icon: "eraser.line.dashed"
                        )
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
                    Text("Links are references only. AyahClip never downloads another creator’s post. For media you own, use Clean a watermark before editing.")
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
