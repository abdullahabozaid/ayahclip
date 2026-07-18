import SwiftUI

struct SettingsView: View {
    private var buildLabel: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            ?? "Unknown"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
            ?? "Unknown"
        return "AyahClip \(version) (\(build)) · TestFlight beta"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Settings")
                        .font(.system(size: 30, weight: .semibold, design: .serif))
                        .foregroundStyle(AyahTheme.parchment)
                    Text("Private by design. Your imported media and projects stay on this device during the beta.")
                        .font(.subheadline)
                        .foregroundStyle(AyahTheme.muted)
                }

                VStack(spacing: 0) {
                    SettingsLink(title: "Privacy policy", icon: "hand.raised", url: "https://ayahclip.com/privacy")
                    Divider().overlay(AyahTheme.hairline)
                    SettingsLink(title: "Terms of use", icon: "doc.text", url: "https://ayahclip.com/terms")
                    Divider().overlay(AyahTheme.hairline)
                    SettingsLink(title: "Help and support", icon: "questionmark.circle", url: "https://ayahclip.com/support")
                }
                .ayahPanel()

                VStack(alignment: .leading, spacing: 10) {
                    Label("Copyright-aware import", systemImage: "checkmark.shield")
                        .font(.headline)
                        .foregroundStyle(AyahTheme.parchment)
                    Text("AyahClip never downloads another creator’s post. Post links are references only. Clean a watermark works on device after you select a video you own or have permission to reuse.")
                        .font(.caption)
                        .lineSpacing(3)
                        .foregroundStyle(AyahTheme.muted)
                }
                .padding(18)
                .ayahPanel()

                Text(buildLabel)
                    .font(.caption2.monospaced())
                    .foregroundStyle(AyahTheme.muted.opacity(0.72))
                    .frame(maxWidth: .infinity)
            }
            .padding(20)
        }
        .background(AyahTheme.ink.overlay(AyahTheme.background).ignoresSafeArea())
        .navigationBarHidden(true)
    }
}

private struct SettingsLink: View {
    let title: String
    let icon: String
    let url: String

    var body: some View {
        Link(destination: URL(string: url)!) {
            HStack(spacing: 13) {
                Image(systemName: icon)
                    .foregroundStyle(AyahTheme.goldSoft)
                    .frame(width: 28)
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AyahTheme.parchment)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption)
                    .foregroundStyle(AyahTheme.muted)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 54)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityHint("Opens in your browser")
        .accessibilityIdentifier(identifier)
    }

    private var identifier: String {
        switch title {
        case "Privacy policy": "settings-privacy-link"
        case "Terms of use": "settings-terms-link"
        default: "settings-support-link"
        }
    }
}
