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
});
