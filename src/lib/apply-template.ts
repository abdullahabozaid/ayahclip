import { createBackgroundScene } from "./background-sequence";
import { useAppStore } from "./store";
import { stripBackgroundKeys, stripMediaKeys } from "./style";
import type { TemplateDefinition } from "./template-model";

export interface ApplyTemplateOptions {
  /**
   * Apply-time override of the template's media behaviour. Omitted → the
   * template's stored policy decides (legacy behaviour: preserve-policy
   * templates keep the current background but may still restructure scenes
   * and request media for their slots). `true` forces the template's media
   * composition. `false` is the strict "keep my media" mode: only non-media
   * styling applies — no scene restructuring, no media-slot prompts.
   */
  replaceMedia?: boolean;
}

type MediaMode = "template" | "legacy-preserve" | "keep";

/** Apply one reusable template without touching Quran/audio selection. */
export function applyTemplate(template: TemplateDefinition, options?: ApplyTemplateOptions): void {
  const state = useAppStore.getState();
  const mode: MediaMode =
    options?.replaceMedia === undefined
      ? template.mediaPolicy === "use-template-media" ? "template" : "legacy-preserve"
      : options.replaceMedia ? "template" : "keep";
  const style =
    mode === "template"
      ? template.settings
      : mode === "legacy-preserve"
        ? stripBackgroundKeys(template.settings)
        : stripMediaKeys(template.settings);
  state.applyStyle(style);
  const appliedState = useAppStore.getState();

  const sequence = template.extras.backgroundSequence;
  if (sequence?.enabled && mode !== "keep") {
    const existing = appliedState.backgroundSequenceEnabled
      ? appliedState.backgroundScenes
      : [];
    const scenes = existing.slice(0, sequence.sceneCount).map((scene) => ({
      ...scene,
      duration: sequence.duration,
      transition: sequence.transition,
      transitionDuration: sequence.transitionDuration,
    }));
    while (scenes.length < sequence.sceneCount) {
      scenes.push(
        createBackgroundScene(appliedState.background, {
          duration: sequence.duration,
          transition: sequence.transition,
          transitionDuration: sequence.transitionDuration,
          fit: appliedState.backgroundFit,
          backdrop: appliedState.fitBackdrop,
          transform: { ...appliedState.mediaTransform },
        })
      );
    }
    useAppStore.setState({
      backgroundSequenceEnabled: true,
      backgroundScenes: scenes,
      activeBackgroundSceneId: scenes[0]?.id ?? null,
      ...(scenes[0]
        ? {
            background: scenes[0].background,
            backgroundFit: scenes[0].fit,
            fitBackdrop: scenes[0].backdrop,
            mediaTransform: scenes[0].transform,
          }
        : {}),
    });
  } else if (sequence && !sequence.enabled && mode === "template") {
    useAppStore.setState({
      backgroundSequenceEnabled: false,
      backgroundScenes: [],
      activeBackgroundSceneId: null,
    });
  }

  if (template.extras.wordHighlight !== undefined) {
    state.setWordHighlight(template.extras.wordHighlight);
  }
  if (template.extras.clipFadeMs !== undefined) {
    state.setClipFadeMs(template.extras.clipFadeMs);
  }
  if (template.extras.audioFadeIn !== undefined) {
    state.setAudioFadeIn(template.extras.audioFadeIn);
  }
  if (template.extras.safeAreaTarget !== undefined) {
    state.setSafeAreaTarget(template.extras.safeAreaTarget);
  }
  if (template.extras.safePadding !== undefined) {
    state.setSafePadding(template.extras.safePadding);
  }

  // Media slots prompt the user to drop the template's media in — meaningless
  // when this apply was explicitly told to keep the current media.
  useAppStore.getState().setPendingTemplateMedia(
    mode !== "keep" && template.mediaSlots.length > 0
      ? {
          templateName: template.name,
          slots: template.mediaSlots.map((slot) => ({ ...slot })),
        }
      : null,
  );
}
