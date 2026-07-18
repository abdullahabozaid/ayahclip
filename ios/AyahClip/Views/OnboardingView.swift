import SwiftUI

struct OnboardingView: View {
    let onFinish: () -> Void
    @State private var page = 0

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "waveform.path",
            eyebrow: "AYAHCLIP FOR IPHONE",
            title: "Quran clips, made calmly",
            detail: "Shape vertical recitation videos without sending your original media to a server."
        ),
        OnboardingPage(
            icon: "square.and.arrow.down.on.square",
            eyebrow: "IMPORT WITH INTENT",
            title: "Start from media you own",
            detail: "Choose from Photos or Files, or send an original video to AyahClip from the Share Sheet. Post links are kept as references."
        ),
        OnboardingPage(
            icon: "rectangle.inset.filled.and.person.filled",
            eyebrow: "PREVIEW = EXPORT",
            title: "Design once, publish anywhere",
            detail: "Use centered, side-fade or lower-third layouts, verify every ayah, then export a clean 9:16 MP4."
        )
    ]

    var body: some View {
        ZStack {
            AyahTheme.ink.ignoresSafeArea()
            RadialGradient(
                colors: [AyahTheme.gold.opacity(0.12), .clear],
                center: .top,
                startRadius: 20,
                endRadius: 420
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Text("AyahClip")
                        .font(.system(.headline, design: .serif, weight: .semibold))
                        .foregroundStyle(AyahTheme.parchment)
                    Spacer()
                    if page < pages.count - 1 {
                        Button("Skip", action: onFinish)
                            .foregroundStyle(AyahTheme.muted)
                            .frame(minHeight: 44)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)

                TabView(selection: $page) {
                    ForEach(Array(pages.enumerated()), id: \.offset) { index, item in
                        OnboardingPageView(page: item)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                HStack(spacing: 7) {
                    ForEach(pages.indices, id: \.self) { index in
                        Capsule()
                            .fill(index == page ? AyahTheme.gold : AyahTheme.parchment.opacity(0.14))
                            .frame(width: index == page ? 28 : 7, height: 7)
                            .animation(.easeOut(duration: 0.22), value: page)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Page \(page + 1) of \(pages.count)")

                Button {
                    if page == pages.count - 1 {
                        onFinish()
                    } else {
                        withAnimation(.easeOut(duration: 0.25)) { page += 1 }
                    }
                } label: {
                    HStack {
                        Text(page == pages.count - 1 ? "Create my first clip" : "Continue")
                        Spacer()
                        Image(systemName: page == pages.count - 1 ? "sparkles" : "arrow.right")
                    }
                    .font(.headline)
                    .foregroundStyle(AyahTheme.inkDeep)
                    .padding(.horizontal, 20)
                    .frame(maxWidth: .infinity, minHeight: 58)
                    .background(AyahTheme.gold)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(24)
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct OnboardingPage: Hashable {
    let icon: String
    let eyebrow: String
    let title: String
    let detail: String
}

private struct OnboardingPageView: View {
    let page: OnboardingPage

    var body: some View {
        VStack(spacing: 26) {
            Spacer()
            ZStack {
                Circle()
                    .fill(AyahTheme.surfaceRaised)
                    .frame(width: 150, height: 150)
                Circle()
                    .stroke(AyahTheme.gold.opacity(0.32), lineWidth: 1)
                    .frame(width: 118, height: 118)
                Image(systemName: page.icon)
                    .font(.system(size: 45, weight: .light))
                    .foregroundStyle(AyahTheme.goldSoft)
            }
            VStack(spacing: 14) {
                Text(page.eyebrow)
                    .font(.caption2.weight(.bold))
                    .tracking(2.3)
                    .foregroundStyle(AyahTheme.goldSoft)
                Text(page.title)
                    .font(.system(size: 36, weight: .semibold, design: .serif))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AyahTheme.parchment)
                Text(page.detail)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .lineSpacing(5)
                    .foregroundStyle(AyahTheme.muted)
                    .padding(.horizontal, 28)
            }
            Spacer()
        }
    }
}
