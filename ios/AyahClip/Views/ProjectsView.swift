import SwiftUI

struct ProjectsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("AyahClip")
                        .font(.system(size: 34, weight: .semibold, design: .serif))
                        .foregroundStyle(AyahTheme.parchment)
                    Text("Create luminous Quran clips without sending your media to a server.")
                        .font(.subheadline)
                        .foregroundStyle(AyahTheme.muted)
                }

                Button {
                    model.createProject()
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "plus")
                            .font(.headline)
                            .foregroundStyle(AyahTheme.goldSoft)
                            .frame(width: 44, height: 44)
                            .background(AyahTheme.inkDeep)
                            .clipShape(Circle())
                        VStack(alignment: .leading, spacing: 3) {
                            Text("New Quran clip")
                                .font(.headline)
                            Text("Start with a verse, recitation, or your own video")
                                .font(.caption)
                                .foregroundStyle(AyahTheme.ink.opacity(0.72))
                        }
                        Spacer()
                        Image(systemName: "arrow.right")
                    }
                    .padding(16)
                    .foregroundStyle(AyahTheme.inkDeep)
                    .background(AyahTheme.gold)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("New Quran clip")
                .accessibilityHint("Start with a verse, recitation, or your own video")

                if model.projects.isEmpty {
                    VStack(spacing: 14) {
                        Image(systemName: "rectangle.stack.badge.plus")
                            .font(.system(size: 28, weight: .light))
                            .foregroundStyle(AyahTheme.goldSoft)
                        Text("Your saved clips will live here")
                            .font(.headline)
                            .foregroundStyle(AyahTheme.parchment)
                        Text("Projects stay on this device during the beta.")
                            .font(.caption)
                            .foregroundStyle(AyahTheme.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 48)
                    .ayahPanel()
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(model.projects) { project in
                            HStack(spacing: 0) {
                                Button { model.open(project) } label: {
                                    ProjectRow(project: project)
                                }
                                .buttonStyle(.plain)
                                Menu {
                                    Button {
                                        model.duplicate(project)
                                    } label: {
                                        Label("Duplicate", systemImage: "plus.square.on.square")
                                    }
                                    Button(role: .destructive) {
                                        model.delete(project)
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                } label: {
                                    Image(systemName: "ellipsis")
                                        .foregroundStyle(AyahTheme.muted)
                                        .frame(width: 44, height: 54)
                                }
                                .accessibilityLabel("Project actions for \(project.title)")
                            }
                            .padding(.trailing, 4)
                            .ayahPanel()
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(AyahTheme.ink.overlay(AyahTheme.background).ignoresSafeArea())
        .navigationBarHidden(true)
    }
}

private struct ProjectRow: View {
    let project: ClipProject

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(AyahTheme.inkDeep)
                .aspectRatio(9 / 16, contentMode: .fit)
                .frame(height: 82)
                .overlay {
                    Text("﷽")
                        .font(.system(size: 22))
                        .foregroundStyle(AyahTheme.goldSoft)
                }
            VStack(alignment: .leading, spacing: 5) {
                Text(project.title)
                    .font(.headline)
                    .foregroundStyle(AyahTheme.parchment)
                Text("\(project.surahName) · \(project.verseRange)")
                    .font(.caption)
                    .foregroundStyle(AyahTheme.muted)
                Text(project.updatedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(AyahTheme.muted.opacity(0.7))
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(AyahTheme.muted)
        }
        .padding(12)
    }
}
