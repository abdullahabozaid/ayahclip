import { useAppStore } from "./store";
import { extractStyle, stripMediaKeys, type StyleSettings } from "./style";
import type { TemplateExtras } from "./template-model";

/**
 * A portable "look" captured from the studio: everything a creator styled —
 * typography, colours, text position, overlays, safe areas — plus the media
 * fields, which appliers may strip. Used by Bulk Create's "apply this look to
 * every clip".
 */
export interface StyleSnapshot {
  settings: StyleSettings;
  extras: TemplateExtras;
  /** Whether appliers should also copy the media fields. */
  includeMedia: boolean;
  capturedAt: number;
}

/**
 * Capture the current look with media included only when the media can
 * actually survive persistence: preset/stock backgrounds are stable URLs,
 * while blob: URLs (uploaded files, the bulk source video) die with the
 * session — persisting them would restore a dead background. Blob-backed
 * media falls back to a style-only snapshot; the rebuild path re-derives
 * such media from its own durable source.
 */
export function captureDurableStyleSnapshot(): StyleSnapshot {
  const state = useAppStore.getState();
  const mediaIsDurable = !state.background.value.startsWith("blob:")
    && !state.backgroundSequenceEnabled;
  return captureStyleSnapshot(mediaIsDurable);
}

export function captureStyleSnapshot(includeMedia: boolean): StyleSnapshot {
  const state = useAppStore.getState();
  const firstScene = state.backgroundScenes[0];
  return {
    settings: extractStyle(state),
    extras: {
      wordHighlight: state.wordHighlight,
      clipFadeMs: state.clipFadeMs,
      audioFadeIn: state.audioFadeIn,
      safeAreaTarget: state.safeAreaTarget,
      safePadding: state.safePadding,
      backgroundSequence: state.backgroundSequenceEnabled
        ? {
            enabled: true,
            sceneCount: Math.max(2, state.backgroundScenes.length),
            duration: firstScene?.duration ?? 5,
            transition: firstScene?.transition ?? "crossfade",
            transitionDuration: firstScene?.transitionDuration ?? 0.6,
          }
        : { enabled: false, sceneCount: 1, duration: 5, transition: "cut", transitionDuration: 0.1 },
    },
    includeMedia,
    capturedAt: Date.now(),
  };
}

/**
 * Apply a captured look to the current studio state. Runs AFTER any template
 * so the creator's explicit edits win; media fields are copied only when the
 * snapshot was captured with "also replace media".
 */
export function applyStyleSnapshot(snapshot: StyleSnapshot): void {
  const state = useAppStore.getState();
  state.applyStyle(snapshot.includeMedia ? snapshot.settings : stripMediaKeys(snapshot.settings));
  if (snapshot.extras.wordHighlight !== undefined) state.setWordHighlight(snapshot.extras.wordHighlight);
  if (snapshot.extras.clipFadeMs !== undefined) state.setClipFadeMs(snapshot.extras.clipFadeMs);
  if (snapshot.extras.audioFadeIn !== undefined) state.setAudioFadeIn(snapshot.extras.audioFadeIn);
  if (snapshot.extras.safeAreaTarget !== undefined) state.setSafeAreaTarget(snapshot.extras.safeAreaTarget);
  if (snapshot.extras.safePadding !== undefined) state.setSafePadding(snapshot.extras.safePadding);
  // Scene structure is media: only a media-carrying snapshot may change it,
  // and then only by disabling a sequence the target clip doesn't want —
  // scene media itself lives in blob URLs that cannot travel between clips.
  if (snapshot.includeMedia && snapshot.extras.backgroundSequence?.enabled === false) {
    useAppStore.setState({
      backgroundSequenceEnabled: false,
      backgroundScenes: [],
      activeBackgroundSceneId: null,
    });
  }
}
