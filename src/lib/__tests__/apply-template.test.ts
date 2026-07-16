import { beforeEach, describe, expect, it } from "vitest";
import { applyTemplate } from "../apply-template";
import { useAppStore } from "../store";
import { TEMPLATES } from "../templates";

const broll = TEMPLATES.find((template) => template.id === "broll-rotation");
if (!broll) throw new Error("B-roll template fixture missing");

describe("template application media handoff", () => {
  beforeEach(() => {
    useAppStore.setState({
      background: { type: "solid", value: "#111111", label: "Before" },
      backgroundSequenceEnabled: false,
      backgroundScenes: [],
      activeBackgroundSceneId: null,
      pendingTemplateMedia: null,
    });
  });

  it("creates an ordered media request for every reusable slot", () => {
    applyTemplate(broll);

    expect(useAppStore.getState().pendingTemplateMedia).toEqual({
      templateName: "B-roll Rotation",
      slots: [
        { id: "scene:0", accepts: "image-or-video", label: "B-roll 1" },
        { id: "scene:1", accepts: "image-or-video", label: "B-roll 2" },
        { id: "scene:2", accepts: "image-or-video", label: "B-roll 3" },
      ],
    });
  });

  it("uses the newly applied template background when creating sequence scenes", () => {
    const template = {
      ...broll,
      mediaPolicy: "use-template-media" as const,
      settings: {
        ...broll.settings,
        background: {
          type: "solid" as const,
          value: "#0b2a21",
          label: "Emerald",
        },
      },
    };

    applyTemplate(template);
    expect(useAppStore.getState().backgroundScenes).toHaveLength(3);
    expect(
      useAppStore.getState().backgroundScenes.every(
        (scene) => scene.background.value === "#0b2a21",
      ),
    ).toBe(true);
  });

  it("clears the prompt as each placeholder is fulfilled", () => {
    applyTemplate(broll);
    const state = useAppStore.getState();
    state.fulfillTemplateMediaSlot("scene:0");
    state.fulfillTemplateMediaSlot("scene:1");
    expect(useAppStore.getState().pendingTemplateMedia?.slots.map((slot) => slot.id)).toEqual([
      "scene:2",
    ]);
    state.fulfillTemplateMediaSlot("scene:2");
    expect(useAppStore.getState().pendingTemplateMedia).toBeNull();
  });

  it("keeps the active B-roll scene and editor controls in sync", () => {
    useAppStore.setState({
      background: { type: "solid", value: "#999999", label: "Last selected" },
      backgroundSequenceEnabled: true,
      backgroundScenes: [
        {
          id: "first",
          background: { type: "solid", value: "#111111", label: "First" },
          duration: 4,
          transition: "crossfade",
          transitionDuration: 0.5,
          fit: "cover",
          backdrop: "black",
          transform: { scale: 1.4, x: 0.25, y: -0.1 },
        },
        {
          id: "last",
          background: { type: "solid", value: "#999999", label: "Last selected" },
          duration: 4,
          transition: "crossfade",
          transitionDuration: 0.5,
          fit: "contain",
          backdrop: "blur",
          transform: { scale: 1, x: 0, y: 0 },
        },
      ],
      activeBackgroundSceneId: "last",
    });

    applyTemplate(broll);
    const state = useAppStore.getState();
    expect(state.activeBackgroundSceneId).toBe("first");
    expect(state.background.value).toBe("#111111");
    expect(state.backgroundFit).toBe("cover");
    expect(state.fitBackdrop).toBe("black");
    expect(state.mediaTransform).toEqual({ scale: 1.4, x: 0.25, y: -0.1 });
  });
});
