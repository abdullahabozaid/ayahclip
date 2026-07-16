import { createBackgroundScene } from "./background-sequence";
import { useAppStore } from "./store";
import { stripBackgroundKeys } from "./style";
import type { TemplateDefinition } from "./template-model";

/** Apply one reusable template without touching Quran/audio selection. */
export function applyTemplate(template: TemplateDefinition): void {
  const state = useAppStore.getState();
  const style =
    template.mediaPolicy === "preserve-current-media"
      ? stripBackgroundKeys(template.settings)
      : template.settings;
  state.applyStyle(style);
  const appliedState = useAppStore.getState();

  const sequence = template.extras.backgroundSequence;
  if (sequence?.enabled) {
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
  } else if (
    sequence &&
    !sequence.enabled &&
    template.mediaPolicy === "use-template-media"
  ) {
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

  useAppStore.getState().setPendingTemplateMedia(
    template.mediaSlots.length > 0
      ? {
          templateName: template.name,
          slots: template.mediaSlots.map((slot) => ({ ...slot })),
        }
      : null,
  );
}
