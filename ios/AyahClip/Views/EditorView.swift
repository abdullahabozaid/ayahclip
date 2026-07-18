import AVFoundation
import SwiftUI
import UIKit

struct EditorView: View {
    @Environment(AppModel.self) private var model
    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var playhead = 0.28
    @State private var duration = 16.0
    @State private var showCaptionEditor = false
    @State private var selectedSegmentID: UUID?
    @State private var presentedTool: EditorTool?
    @State private var playerLoadID = UUID()

    var body: some View {
        @Bindable var model = model

        ZStack {
            AyahTheme.ink.ignoresSafeArea()

            VStack(spacing: 0) {
                editorHeader
                previewStage
                timelinePanel
                toolDock
            }
        }
        .onAppear {
            preparePlayer()
            selectedSegmentID = selectedSegmentID ?? project.segments.first?.id
        }
        .onChange(of: model.importedMediaURLs) { _, _ in preparePlayer() }
        .task { await trackPlayback() }
        .sheet(item: $presentedTool) { tool in
            EditorToolPanel(
                tool: tool,
                playhead: playhead,
                selectedSegmentID: $selectedSegmentID,
                showCaptionEditor: $showCaptionEditor
            )
                .environment(model)
        }
        .interactiveDismissDisabled()
    }

    private var project: ClipProject { model.activeProject ?? .starter }

    private var editorHeader: some View {
        HStack(spacing: 10) {
            Button { model.closeEditor() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: 38, height: 44)
            }
            .accessibilityLabel("Close editor")

            VStack(alignment: .leading, spacing: 2) {
                Text(project.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AyahTheme.parchment)
                    .lineLimit(1)
                Text("\(project.surahName) · \(project.verseRange)")
                    .font(.system(size: 10, weight: .regular))
                    .foregroundStyle(AyahTheme.muted)
                    .lineLimit(1)
            }
            Spacer()
            Button { } label: {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 14, weight: .medium))
                    .frame(width: 36, height: 44)
            }
            .disabled(true)
            .accessibilityLabel("Undo")
            Button("Export") {
                model.updateActive { $0.selectedTool = .export }
                presentedTool = .export
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(AyahTheme.inkDeep)
            .padding(.horizontal, 14)
            .frame(height: 34)
            .background(AyahTheme.gold)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        }
        .padding(.horizontal, 10)
        .frame(height: 50)
        .foregroundStyle(AyahTheme.muted)
        .background(AyahTheme.inkDeep)
        .overlay(alignment: .bottom) { Divider().overlay(AyahTheme.parchment.opacity(0.08)) }
    }

    private var previewStage: some View {
        GeometryReader { proxy in
            let canvasHeight = min(430, max(240, proxy.size.height - 12))
            let canvasWidth = canvasHeight * 9 / 16
            ZStack {
                Color.black
                previewCanvas
                    .frame(width: canvasWidth, height: canvasHeight)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("9 by 16 video preview with Quran captions")
                    .accessibilityIdentifier("editor-canvas")
                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .stroke(.white.opacity(0.14), lineWidth: 0.5)
                    }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minHeight: 270)
        .layoutPriority(1)
        .background(Color.black)
    }

    private var previewCanvas: some View {
        ZStack {
            if let player {
                AspectFillPlayer(player: player)
                    .accessibilityLabel("Clip video preview")
            } else {
                LinearGradient(
                    colors: [.black, Color(red: 0.04, green: 0.12, blue: 0.20), .black],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                VStack {
                    HStack(spacing: 6) {
                        Image(systemName: "film")
                        Text("Add media to preview")
                    }
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(AyahTheme.muted.opacity(0.75))
                    .padding(.horizontal, 9)
                    .frame(height: 26)
                    .background(.black.opacity(0.42))
                    .clipShape(Capsule())
                    .padding(.top, 12)
                    Spacer()
                }
            }
            CaptionPreviewOverlay(project: project, time: duration * playhead)
        }
        .background(.black)
    }

    private var timelinePanel: some View {
        VStack(spacing: 7) {
            HStack(spacing: 12) {
                Text(timecode(duration * playhead))
                    .frame(width: 38, alignment: .leading)
                Button { togglePlayback() } label: {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 32, height: 30)
                        .background(AyahTheme.surfaceRaised)
                        .clipShape(Circle())
                }
                .accessibilityLabel(isPlaying ? "Pause" : "Play")
                Spacer()
                Text(timecode(duration))
                    .frame(width: 38, alignment: .trailing)
            }
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(AyahTheme.muted)

            TimelineScrubber(value: $playhead) {
                guard let player else { return }
                player.seek(to: CMTime(seconds: duration * playhead, preferredTimescale: 600))
            }

            TimelineStrip(
                playhead: $playhead,
                selectedSegmentID: $selectedSegmentID,
                onSeek: seekPlayer
            )
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(height: 118)
        .background(AyahTheme.inkDeep)
        .overlay(alignment: .top) { Divider().overlay(.white.opacity(0.07)) }
    }

    private var toolDock: some View {
        HStack {
            ForEach([EditorTool.edit, .captions, .style, .media]) { tool in
                Button {
                    model.updateActive { $0.selectedTool = tool }
                    presentedTool = tool
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tool.systemImage).font(.system(size: 17, weight: .regular))
                        Text(tool.rawValue == "Captions" ? "Text" : tool.rawValue)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(AyahTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tool == .captions ? "Text" : tool.rawValue)
            }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 2)
        .background(AyahTheme.inkDeep)
        .overlay(alignment: .top) { Divider().overlay(AyahTheme.parchment.opacity(0.08)) }
    }

    private func preparePlayer() {
        let urls = model.importedMediaURLs
        guard !urls.isEmpty else {
            player = nil
            return
        }
        let loadID = UUID()
        playerLoadID = loadID
        player = nil
        Task {
            guard let asset = try? await VideoExportService.makeTimelineAsset(
                sourceURLs: urls,
                project: project
            ), playerLoadID == loadID else { return }
            let loaded = (try? await asset.load(.duration).seconds) ?? 0
            guard playerLoadID == loadID else { return }
            player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
            if loaded.isFinite, loaded > 0 {
                duration = loaded
                playhead = 0
            }
        }
    }

    private func togglePlayback() {
        guard let player else { return }
        if isPlaying {
            player.pause()
        } else {
            player.seek(to: CMTime(seconds: duration * playhead, preferredTimescale: 600))
            player.play()
        }
        isPlaying.toggle()
    }

    private func seekPlayer() {
        player?.seek(to: CMTime(seconds: duration * playhead, preferredTimescale: 600))
    }

    private func trackPlayback() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(50))
            guard isPlaying, let player else { continue }
            let current = player.currentTime().seconds
            guard current.isFinite, duration > 0 else { continue }
            playhead = min(1, max(0, current / duration))
            selectedSegmentID = project.segments.first(where: {
                current >= $0.start && current < $0.end
            })?.id ?? selectedSegmentID
            if current >= duration - 0.04 {
                player.pause()
                isPlaying = false
            }
        }
    }

    private func timecode(_ seconds: Double) -> String {
        let value = max(0, Int(seconds.rounded(.down)))
        return String(format: "%02d:%02d", value / 60, value % 60)
    }
}

private struct TimelineScrubber: View {
    @Binding var value: Double
    let onSeek: () -> Void

    var body: some View {
        CompactSlider(
            value: $value,
            range: 0...1,
            accessibilityLabel: "Timeline playhead",
            onCommit: onSeek
        )
    }
}

private struct CompactSlider: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    let accessibilityLabel: String
    var onCommit: () -> Void = {}

    var body: some View {
        GeometryReader { proxy in
            let fraction = (value - range.lowerBound) / max(0.0001, range.upperBound - range.lowerBound)
            let x = max(0, min(proxy.size.width, proxy.size.width * fraction))
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.white.opacity(0.12))
                    .frame(height: 3)
                Capsule()
                    .fill(AyahTheme.gold)
                    .frame(width: x, height: 3)
                Circle()
                    .fill(AyahTheme.parchment)
                    .frame(width: 12, height: 12)
                    .offset(x: max(0, min(proxy.size.width - 12, x - 6)))
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { gesture in
                        let fraction = max(0, min(1, gesture.location.x / max(1, proxy.size.width)))
                        value = range.lowerBound + fraction * (range.upperBound - range.lowerBound)
                    }
                    .onEnded { _ in onCommit() }
            )
        }
        .frame(height: 18)
        .accessibilityRepresentation {
            Slider(value: $value, in: range) { editing in
                if !editing { onCommit() }
            }
            .accessibilityLabel(accessibilityLabel)
        }
    }
}

private struct AspectFillPlayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerSurfaceView {
        let view = PlayerSurfaceView()
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: PlayerSurfaceView, context: Context) {
        uiView.playerLayer.player = player
    }
}

private final class PlayerSurfaceView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }

    override init(frame: CGRect) {
        super.init(frame: frame)
        playerLayer.videoGravity = .resizeAspectFill
        backgroundColor = .black
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

private struct CaptionPreviewOverlay: View {
    let project: ClipProject
    let time: Double

    var body: some View {
        GeometryReader { proxy in
            let scale = proxy.size.width / 1080
            let rects = captionRects
            ZStack(alignment: .topLeading) {
                backdrop

                Text(project.captions(at: time)?.arabic ?? "")
                    .font(.custom(
                        "UthmanicHafs1Ver18",
                        size: project.arabicSize * 2.4 * scale * (project.layout == .sideFade ? 0.72 : 1)
                    ))
                    .multilineTextAlignment(.center)
                    .lineSpacing(2 * scale)
                    .foregroundStyle(captionColor)
                    .shadow(color: shadowColor, radius: shadowRadius(scale), y: scale)
                    .environment(\.layoutDirection, .rightToLeft)
                    .frame(width: rects.arabic.width * scale, height: rects.arabic.height * scale, alignment: .top)
                    .position(x: rects.arabic.midX * scale, y: rects.arabic.midY * scale)

                Text(project.captions(at: time)?.translation ?? "")
                    .font(.system(
                        size: project.translationSize * 2.25 * scale * (project.layout == .sideFade ? 0.84 : 1),
                        weight: .medium
                    ))
                    .multilineTextAlignment(.center)
                    .lineSpacing(scale)
                    .foregroundStyle(captionColor.opacity(0.94))
                    .shadow(color: shadowColor, radius: shadowRadius(scale), y: scale)
                    .frame(width: rects.translation.width * scale, height: rects.translation.height * scale, alignment: .top)
                    .position(x: rects.translation.midX * scale, y: rects.translation.midY * scale)
            }
        }
        .allowsHitTesting(false)
    }

    private var captionRects: (arabic: CGRect, translation: CGRect) {
        switch project.layout {
        case .centered:
            (CGRect(x: 90, y: 690, width: 900, height: 330), CGRect(x: 120, y: 1035, width: 840, height: 190))
        case .sideFade:
            (CGRect(x: 48, y: 660, width: 620, height: 390), CGRect(x: 62, y: 1060, width: 590, height: 250))
        case .lowerThird:
            (CGRect(x: 90, y: 1190, width: 900, height: 310), CGRect(x: 120, y: 1510, width: 840, height: 190))
        }
    }

    @ViewBuilder private var backdrop: some View {
        if project.layout == .sideFade {
            LinearGradient(
                colors: [
                    .black.opacity(min(0.96, project.overlayOpacity + 0.5)),
                    .black.opacity(project.overlayOpacity),
                    .clear
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        } else {
            Color.black.opacity(project.overlayOpacity)
        }
    }

    private var captionColor: Color {
        project.captionStyle == .gold ? AyahTheme.goldSoft : AyahTheme.parchment
    }

    private var shadowColor: Color {
        project.captionStyle == .softGlow ? .white.opacity(0.42) : .black.opacity(0.92)
    }

    private func shadowRadius(_ scale: CGFloat) -> CGFloat {
        project.captionStyle == .softGlow ? 12 * scale : 3 * scale
    }
}

private struct TimelineStrip: View {
    @Environment(AppModel.self) private var model
    @Binding var playhead: Double
    @Binding var selectedSegmentID: UUID?
    let onSeek: () -> Void

    var body: some View {
        let project = model.activeProject ?? .starter
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                HStack(spacing: 3) {
                    ForEach(project.segments) { segment in
                        let isSelected = segment.id == selectedSegmentID
                        Button {
                            selectedSegmentID = segment.id
                            let total = max(0.001, project.segments.map(\.end).max() ?? 1)
                            playhead = min(1, max(0, segment.start / total))
                            onSeek()
                        } label: {
                            ZStack(alignment: .bottomLeading) {
                                LinearGradient(
                                    colors: [AyahTheme.surfaceRaised, AyahTheme.ink],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                                Text("V\(segment.verse)")
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundStyle(isSelected ? AyahTheme.goldSoft : AyahTheme.muted)
                                    .padding(5)
                            }
                            .overlay {
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(isSelected ? AyahTheme.gold : .white.opacity(0.08), lineWidth: isSelected ? 1.5 : 0.5)
                            }
                            .frame(
                                width: max(
                                    34,
                                    proxy.size.width * (segment.end - segment.start)
                                        / max(0.001, project.segments.map(\.end).max() ?? 1)
                                )
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                Rectangle()
                    .fill(.white)
                    .frame(width: 1.5)
                    .offset(x: max(0, proxy.size.width * playhead - 0.75))
            }
        }
        .frame(height: 42)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

private struct EditorToolPanel: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let tool: EditorTool
    let playhead: Double
    @Binding var selectedSegmentID: UUID?
    @Binding var showCaptionEditor: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(panelTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AyahTheme.parchment)
                Spacer()
                Button("Done") { dismiss() }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AyahTheme.goldSoft)
            }

            switch tool {
            case .edit:
                TimelineEditor(playhead: playhead, selectedSegmentID: $selectedSegmentID)
            case .captions:
                CaptionControls(selectedSegmentID: $selectedSegmentID) { showCaptionEditor = true }
            case .style:
                StyleControls()
            case .media:
                MediaControls()
            case .export:
                ExportControls()
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .background(AyahTheme.surface.ignoresSafeArea())
        .presentationDetents([.height(panelHeight)])
        .presentationDragIndicator(.visible)
        .presentationBackground(AyahTheme.surface)
        .sheet(isPresented: $showCaptionEditor) {
            CaptionEditorSheet(selectedSegmentID: $selectedSegmentID)
                .environment(model)
        }
    }

    private var panelTitle: String {
        switch tool {
        case .edit: "Fine timing"
        case .captions: "Text"
        case .style: "Style"
        case .media: "Media"
        case .export: "Export"
        }
    }

    private var panelHeight: CGFloat {
        switch tool {
        case .edit: 245
        case .captions: 250
        case .style: 285
        case .media: 300
        case .export: 220
        }
    }
}

private struct TimelineEditor: View {
    @Environment(AppModel.self) private var model
    let playhead: Double
    @Binding var selectedSegmentID: UUID?

    var body: some View {
        let project = model.activeProject ?? .starter
        let selected = project.segments.first(where: { $0.id == selectedSegmentID })
            ?? project.segments.first

        VStack(spacing: 10) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    HStack(spacing: 4) {
                        ForEach(project.segments) { segment in
                            let isSelected = segment.id == selected?.id
                            Button { selectedSegmentID = segment.id } label: {
                                RoundedRectangle(cornerRadius: 7, style: .continuous)
                                    .fill(isSelected ? AyahTheme.gold.opacity(0.25) : AyahTheme.surfaceRaised)
                                    .overlay {
                                        Text("V\(segment.verse)")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(isSelected ? AyahTheme.goldSoft : AyahTheme.muted)
                                    }
                                    .frame(
                                        width: max(
                                            38,
                                            (proxy.size.width - CGFloat(max(0, project.segments.count - 1)) * 4)
                                                * (segment.end - segment.start)
                                                / max(0.001, project.segments.map(\.end).max() ?? 1)
                                        )
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Rectangle()
                        .fill(AyahTheme.parchment)
                        .frame(width: 2)
                        .offset(x: max(0, proxy.size.width * playhead - 1))
                }
            }
            .frame(height: 50)

            if let selected {
                VStack(spacing: 8) {
                    HStack {
                        Text("Verse \(selected.verse)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AyahTheme.parchment)
                        Text("\(timecode(selected.start))–\(timecode(selected.end))")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(AyahTheme.muted)
                        Spacer()
                        Button("Split at playhead") { split(selected, project: project) }
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(AyahTheme.goldSoft)
                        Button(role: .destructive) { remove(selected) } label: {
                            Image(systemName: "trash")
                        }
                        .disabled(project.segments.count <= 1)
                    }
                    HStack(spacing: 7) {
                        BoundaryButton(label: "Start −", accessibility: "Move start earlier") {
                            adjust(segment: selected, edge: .start, delta: -0.1)
                        }
                        BoundaryButton(label: "Start +", accessibility: "Move start later") {
                            adjust(segment: selected, edge: .start, delta: 0.1)
                        }
                        Spacer()
                        BoundaryButton(label: "End −", accessibility: "Move end earlier") {
                            adjust(segment: selected, edge: .end, delta: -0.1)
                        }
                        BoundaryButton(label: "End +", accessibility: "Move end later") {
                            adjust(segment: selected, edge: .end, delta: 0.1)
                        }
                    }
                }
            }
        }
    }

    private enum SegmentEdge { case start, end }

    private func timecode(_ seconds: Double) -> String {
        String(format: "%02d:%02d.%01d", Int(seconds) / 60, Int(seconds) % 60, Int(seconds * 10) % 10)
    }

    private func split(_ segment: VerseSegment, project: ClipProject) {
        let total = project.segments.map(\.end).max() ?? 0
        let splitTime = total * playhead
        var newID: UUID?
        model.updateActive { newID = $0.splitSegment(id: segment.id, at: splitTime) }
        if let newID { selectedSegmentID = newID }
    }

    private func remove(_ segment: VerseSegment) {
        var nextID: UUID?
        model.updateActive { nextID = $0.removeSegment(id: segment.id) }
        selectedSegmentID = nextID
    }

    private func adjust(segment: VerseSegment, edge: SegmentEdge, delta: Double) {
        model.updateActive { project in
            guard let index = project.segments.firstIndex(where: { $0.id == segment.id }) else { return }
            switch edge {
            case .start:
                let previousEnd = index > 0 ? project.segments[index - 1].end : 0
                project.segments[index].start = min(
                    project.segments[index].end - 0.2,
                    max(previousEnd, project.segments[index].start + delta)
                )
            case .end:
                let nextStart = index + 1 < project.segments.count
                    ? project.segments[index + 1].start
                    : max(project.segments[index].end + 60, 600)
                project.segments[index].end = max(
                    project.segments[index].start + 0.2,
                    min(nextStart, project.segments[index].end + delta)
                )
            }
        }
    }
}

private struct BoundaryButton: View {
    let label: String
    let accessibility: String
    let action: () -> Void

    var body: some View {
        Button(label, action: action)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(AyahTheme.goldSoft)
            .padding(.horizontal, 7)
            .frame(minHeight: 32)
            .background(AyahTheme.inkDeep)
            .clipShape(Capsule())
            .accessibilityLabel(accessibility)
    }
}

private struct CaptionControls: View {
    @Environment(AppModel.self) private var model
    @Binding var selectedSegmentID: UUID?
    let onEdit: () -> Void

    var body: some View {
        @Bindable var model = model
        let project = model.activeProject ?? .starter

        VStack(spacing: 10) {
            HStack {
                Text("Arabic").font(.caption).foregroundStyle(AyahTheme.muted).frame(width: 72, alignment: .leading)
                CompactSlider(value: Binding(
                    get: { project.arabicSize },
                    set: { value in model.updateActive { $0.arabicSize = value } }
                ), range: 22...52, accessibilityLabel: "Arabic size")
                Text("\(Int(project.arabicSize))").font(.caption.monospacedDigit()).foregroundStyle(AyahTheme.parchment)
                    .frame(width: 24, alignment: .trailing)
            }
            HStack {
                Text("Translation").font(.caption).foregroundStyle(AyahTheme.muted).frame(width: 72, alignment: .leading)
                CompactSlider(value: Binding(
                    get: { project.translationSize },
                    set: { value in model.updateActive { $0.translationSize = value } }
                ), range: 12...28, accessibilityLabel: "Translation size")
                Text("\(Int(project.translationSize))").font(.caption.monospacedDigit()).foregroundStyle(AyahTheme.parchment)
                    .frame(width: 24, alignment: .trailing)
            }
            Button(action: onEdit) {
                HStack {
                    Text("Edit verse").font(.caption.weight(.medium)).foregroundStyle(AyahTheme.parchment)
                    Text(selectedCaption(in: project)).lineLimit(1).font(.caption).foregroundStyle(AyahTheme.parchment)
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(AyahTheme.muted)
                }
            }
            .buttonStyle(.plain)
            .frame(minHeight: 38)
        }
    }

    private func selectedCaption(in project: ClipProject) -> String {
        let segment = project.segments.first(where: { $0.id == selectedSegmentID })
            ?? project.segments.first
        guard let text = segment?.translation else { return project.translation }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Add translation" : text
    }
}

private struct CaptionEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedSegmentID: UUID?

    var body: some View {
        NavigationStack {
            Form {
                Section("Clip") {
                    TextField("Title", text: field(\.title))
                    TextField("Surah", text: field(\.surahName))
                    TextField("Verse range", text: field(\.verseRange))
                }
                Section(selectedSegmentTitle) {
                    TextEditor(text: segmentField(\.arabic, fallback: \.arabic))
                        .font(.custom("UthmanicHafs1Ver18", size: 28))
                        .multilineTextAlignment(.trailing)
                        .environment(\.layoutDirection, .rightToLeft)
                        .frame(minHeight: 130)
                        .accessibilityLabel("Arabic caption")
                }
                Section("English translation") {
                    TextEditor(text: segmentField(\.translation, fallback: \.translation))
                        .frame(minHeight: 110)
                        .accessibilityLabel("English translation")
                }
                Section {
                    Text("Verify Quran text and translation before publishing. AyahClip preserves exactly what you enter.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Caption text")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .preferredColorScheme(.dark)
    }

    private func field(_ keyPath: WritableKeyPath<ClipProject, String>) -> Binding<String> {
        Binding(
            get: { (model.activeProject ?? .starter)[keyPath: keyPath] },
            set: { value in model.updateActive { $0[keyPath: keyPath] = value } }
        )
    }

    private var selectedSegmentTitle: String {
        guard let project = model.activeProject,
              let segment = project.segments.first(where: { $0.id == selectedSegmentID })
                ?? project.segments.first else { return "Arabic" }
        return "Verse \(segment.verse) Arabic"
    }

    private func segmentField(
        _ keyPath: WritableKeyPath<VerseSegment, String?>,
        fallback: KeyPath<ClipProject, String>
    ) -> Binding<String> {
        Binding(
            get: {
                guard let project = model.activeProject,
                      let segment = project.segments.first(where: { $0.id == selectedSegmentID })
                        ?? project.segments.first else { return "" }
                return segment[keyPath: keyPath] ?? project[keyPath: fallback]
            },
            set: { value in
                model.updateActive { project in
                    guard let index = project.segments.firstIndex(where: { $0.id == selectedSegmentID })
                        ?? project.segments.indices.first else { return }
                    project.segments[index][keyPath: keyPath] = value
                }
            }
        )
    }
}

private struct StyleControls: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let project = model.activeProject ?? .starter
        VStack(spacing: 9) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ClipLayout.allCases) { layout in
                        Button(layout.rawValue) { model.updateActive { $0.layout = layout } }
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 38)
                            .background(project.layout == layout ? AyahTheme.gold.opacity(0.18) : AyahTheme.inkDeep)
                            .clipShape(Capsule())
                            .overlay { Capsule().stroke(project.layout == layout ? AyahTheme.gold : AyahTheme.hairline) }
                    }
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(CaptionStyle.allCases) { style in
                        Button(style.rawValue) { model.updateActive { $0.captionStyle = style } }
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 36)
                            .background(project.captionStyle == style ? AyahTheme.parchment.opacity(0.12) : AyahTheme.inkDeep)
                            .clipShape(Capsule())
                            .overlay { Capsule().stroke(project.captionStyle == style ? AyahTheme.parchment.opacity(0.5) : AyahTheme.hairline) }
                    }
                }
            }
            HStack {
                Text("Overlay").font(.caption).foregroundStyle(AyahTheme.muted)
                CompactSlider(value: Binding(
                    get: { project.overlayOpacity },
                    set: { value in model.updateActive { $0.overlayOpacity = value } }
                ), range: 0...0.75, accessibilityLabel: "Overlay")
                Text("\(Int(project.overlayOpacity * 100))%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(AyahTheme.parchment)
            }
        }
    }
}

private struct MediaControls: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let count = model.importedMediaURLs.count
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: count == 0 ? "film.stack" : "checkmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(count == 0 ? AyahTheme.muted : Color.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(mediaTitle(count: count))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AyahTheme.parchment)
                    Text(count == 0
                        ? "Add media from the Import tab"
                        : count > 1
                            ? "Visuals rotate at verse boundaries"
                            : "Stored privately on this device")
                        .font(.caption)
                        .foregroundStyle(AyahTheme.muted)
                }
            }

            if count > 0 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(model.importedMediaURLs.indices), id: \.self) { index in
                            mediaCard(index: index, count: count)
                        }
                    }
                }
            } else {
                Text("Close the editor and use Import to add a recitation or video sequence.")
                    .font(.caption)
                    .foregroundStyle(AyahTheme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func mediaTitle(count: Int) -> String {
        switch count {
        case 0: "No media attached"
        case 1: "Primary media attached"
        default: "\(count)-source B-roll sequence"
        }
    }

    private func mediaCard(index: Int, count: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: index == 0 ? "waveform" : "film")
                    .foregroundStyle(index == 0 ? AyahTheme.goldSoft : AyahTheme.muted)
                Text(index == 0 ? "Primary" : "B-roll \(index)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AyahTheme.parchment)
            }
            HStack(spacing: 4) {
                Button { Task { await model.moveMedia(from: index, to: index - 1) } } label: {
                    Image(systemName: "chevron.left")
                }
                .disabled(index == 0)
                Button { Task { await model.moveMedia(from: index, to: index + 1) } } label: {
                    Image(systemName: "chevron.right")
                }
                .disabled(index >= count - 1)
                Button(role: .destructive) {
                    Task { await model.removeMedia(at: index) }
                } label: {
                    Image(systemName: "trash")
                }
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.borderless)
        }
        .padding(10)
        .frame(width: 116, alignment: .leading)
        .background(AyahTheme.inkDeep)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(index == 0 ? AyahTheme.gold.opacity(0.55) : AyahTheme.hairline)
        }
    }
}

private struct ExportControls: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("1080 × 1920 · 30 fps").font(.subheadline.weight(.semibold)).foregroundStyle(AyahTheme.parchment)
                Text("TikTok, Reels, and Shorts safe").font(.caption).foregroundStyle(AyahTheme.muted)
            }

            if let url = model.exportURL {
                HStack(spacing: 8) {
                    Button {
                        Task { await model.saveExportToPhotos() }
                    } label: {
                        Label(model.isSavingToPhotos ? "Saving…" : "Save video", systemImage: "arrow.down.to.line")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .tint(AyahTheme.gold)
                    .disabled(model.isSavingToPhotos)
                    .accessibilityIdentifier("save-export-to-photos")

                    ShareLink(item: url) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(AyahTheme.inkDeep)
                            .background(AyahTheme.gold)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }
                .font(.subheadline.weight(.semibold))
            } else if model.isExporting {
                HStack(spacing: 10) {
                    ProgressView().tint(AyahTheme.gold)
                    Text("Rendering MP4…").font(.subheadline).foregroundStyle(AyahTheme.muted)
                }
                .frame(minHeight: 44)
            } else {
                Button(model.importedMediaURL == nil ? "Add media" : "Render MP4") {
                    Task { await model.exportActiveProject() }
                }
                .buttonStyle(.borderedProminent)
                .tint(AyahTheme.gold)
                .foregroundStyle(AyahTheme.inkDeep)
                .frame(minHeight: 44)
            }
            Text(model.exportURL == nil ? "Render once, then share the finished captioned MP4 to any installed app." : "Captioned MP4 ready. Save a copy to Photos or send it through the system Share Sheet.")
                .font(.caption2)
                .foregroundStyle(AyahTheme.muted)
        }
    }
}
