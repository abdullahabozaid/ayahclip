import { describe, expect, it } from "vitest";
import {
  MOBILE_BRIDGE_PROTOCOL_VERSION,
  createMobileBridgeEnvelope,
  createMobileEditorDocument,
  isAllowedMobileEditorURL,
  isNativeMobileEditor,
  isMobileProjectSnapshotV1,
  isValidMobileEditorDocument,
  mobileEditorURL,
  parseMobileBridgeEnvelope,
  readMobileEditorDocument,
  requestNativeProjectHydration,
  requestNativeMediaImport,
  sendNativeExport,
  sendNativeProjectChange,
  subscribeNativeMediaImports,
} from "../mobile-bridge";

describe("mobile editor bridge", () => {
  it("creates an origin-locked versioned Studio URL", () => {
    const url = mobileEditorURL("project 1");
    expect(url.origin).toBe("https://ayahclip.com");
    expect(url.pathname).toBe("/studio");
    expect(url.searchParams.get("native")).toBe("ios");
    expect(url.searchParams.get("bridge")).toBe(String(MOBILE_BRIDGE_PROTOCOL_VERSION));
    expect(url.searchParams.get("project")).toBe("project 1");
    expect(mobileEditorURL("project 2", true).pathname).toBe("/import");
  });

  it("allows only the native passage and Studio workflow", () => {
    expect(isAllowedMobileEditorURL("https://ayahclip.com/studio?native=ios")).toBe(true);
    expect(isAllowedMobileEditorURL("https://www.ayahclip.com/studio/project")).toBe(true);
    expect(isAllowedMobileEditorURL("https://ayahclip.com/import?native=ios")).toBe(true);
    expect(isAllowedMobileEditorURL("http://ayahclip.com/studio")).toBe(false);
    expect(isAllowedMobileEditorURL("https://ayahclip.com.evil.example/studio")).toBe(false);
    expect(isAllowedMobileEditorURL("https://ayahclip.com/privacy")).toBe(false);
  });

  it("accepts only the current typed envelope", () => {
    const valid = {
      protocolVersion: 1,
      id: "message-1",
      type: "detectionResult",
      payload: { surahId: 93, ayahStart: 1, ayahEnd: 4 },
    };
    expect(parseMobileBridgeEnvelope(valid)).toEqual(valid);
    expect(parseMobileBridgeEnvelope({ ...valid, protocolVersion: 2 })).toBeNull();
    expect(parseMobileBridgeEnvelope({ ...valid, type: "runArbitraryJavaScript" })).toBeNull();
    expect(parseMobileBridgeEnvelope({ ...valid, payload: [] })).toBeNull();
  });

  it("exchanges a typed ready message for native project hydration", async () => {
    const snapshot = validSnapshot();
    const sent: unknown[] = [];
    const handler = {
      postMessage(message: unknown) {
        sent.push(message);
        return createMobileBridgeEnvelope("hydrateProject", snapshot, "hydrate-1");
      },
    };

    expect(isNativeMobileEditor("?native=ios&bridge=1")).toBe(true);
    expect(isNativeMobileEditor("?native=ios&bridge=2")).toBe(false);
    await expect(requestNativeProjectHydration("web-1", ["timeline"], handler))
      .resolves.toEqual(snapshot);
    expect((sent[0] as { type: string }).type).toBe("ready");
    await expect(sendNativeProjectChange(snapshot, handler)).resolves.toBe(true);
    expect((sent[1] as { type: string }).type).toBe("projectChanged");
  });

  it("streams a rendered MP4 to native in bounded ordered chunks", async () => {
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const exportId = "842ea782-ded2-4c04-a442-e5125a18d251";
    const handler = {
      postMessage: async (message: { type: string; payload: Record<string, unknown> }) => {
        sent.push(message);
        if (message.type === "requestExport") {
          return createMobileBridgeEnvelope("exportReady", {
            exportId,
            status: "ready",
            chunkSize: 512 * 1_024,
          });
        }
        if (message.type === "exportComplete") {
          return createMobileBridgeEnvelope("exportReady", {
            exportId,
            status: "complete",
            chunkSize: 512 * 1_024,
            fileName: "ayahclip.mp4",
          });
        }
        return { accepted: true };
      },
    };
    const file = new File([new Uint8Array([1, 2, 3, 4])], "ayahclip.mp4", {
      type: "video/mp4",
    });
    const progress: number[] = [];

    const receipt = await sendNativeExport(
      file,
      (sentBytes) => progress.push(sentBytes),
      handler,
    );

    expect(receipt?.status).toBe("complete");
    expect(sent.map((message) => message.type)).toEqual([
      "requestExport",
      "exportChunk",
      "exportComplete",
    ]);
    expect(atob(String(sent[1].payload.base64Data)).split("").map((value) => value.charCodeAt(0)))
      .toEqual([1, 2, 3, 4]);
    expect(progress).toEqual([4]);
  });

  it("requests durable native B-roll handles instead of temporary blob URLs", async () => {
    const media = {
      id: "842ea782-ded2-4c04-a442-e5125a18d251",
      url: "ayahclip-media://asset/842ea782-ded2-4c04-a442-e5125a18d251",
      contentType: "image/jpeg",
      fileSize: 42,
    };
    const notified: unknown[] = [];
    const unsubscribe = subscribeNativeMediaImports((items) => notified.push(items));
    const result = await requestNativeMediaImport({
      kinds: ["image", "video"],
      maxCount: 1,
      purpose: "broll",
    }, {
      postMessage: async (message) => {
        expect(message.type).toBe("requestMediaImport");
        return createMobileBridgeEnvelope("mediaImported", { media: [media] });
      },
    });

    expect(result?.media).toEqual([media]);
    expect(result?.media[0].url.startsWith("blob:")).toBe(false);
    expect(notified).toEqual([[media]]);
    unsubscribe();
  });

  it("preserves rich web settings in a durable versioned editor document", () => {
    const projectId = "842ea782-ded2-4c04-a442-e5125a18d251";
    const media = [{
      id: "session-handle",
      url: "ayahclip-media://asset/session-handle",
      contentType: "video/mp4",
      fileSize: 1234,
    }];
    const document = createMobileEditorDocument(projectId, {
      settings: {
        clipFadeMs: 400,
        textLayout: "left-panel",
        splitMask: { side: "left", opacity: 1, solidWidth: 42, fadeWidth: 24 },
        backgroundSequenceEnabled: true,
        backgroundScenes: [{
          id: "scene-1",
          transition: "crossfade",
          background: { type: "video", value: media[0].url },
        }],
      },
    }, media);

    expect(isValidMobileEditorDocument(document, projectId)).toBe(true);
    expect(JSON.parse(document).project.settings.backgroundSequenceEnabled).toBe(true);
    expect(document).toContain("ayahclip-native-ref://media/0");
    expect(document).not.toContain("ayahclip-media://asset/session-handle");
    expect(readMobileEditorDocument(document, projectId, media))
      .toMatchObject({ settings: { backgroundScenes: [{ background: { value: media[0].url } }] } });
    expect(isValidMobileEditorDocument(document, crypto.randomUUID())).toBe(false);
    expect(() => createMobileEditorDocument(projectId, {
      background: { type: "video", value: "blob:https://ayahclip.com/temporary" },
    })).toThrow(/durable mobile editor document/);
    expect(() => readMobileEditorDocument(
      document.replace("media/0", "media/8"),
      projectId,
      media,
    )).toThrow(/resolve saved native media/);
  });

  it("validates the versioned shared project without accepting unsafe media URLs", () => {
    const snapshot = validSnapshot();
    expect(isMobileProjectSnapshotV1(snapshot)).toBe(true);
    expect(isMobileProjectSnapshotV1({
      ...snapshot,
      media: [{ ...snapshot.media[0], url: "file:///private/source.mov" }],
    })).toBe(false);
    expect(isMobileProjectSnapshotV1({
      ...snapshot,
      segments: [snapshot.segments[1], snapshot.segments[0]],
    })).toBe(false);
    expect(isMobileProjectSnapshotV1({
      ...snapshot,
      quran: { ...snapshot.quran, verseNumbers: [1, 3] },
    })).toBe(false);
    expect(isMobileProjectSnapshotV1({
      ...snapshot,
      media: [{ ...snapshot.media[0], id: "different-handle" }],
    })).toBe(false);
  });
});

function validSnapshot() {
  return {
    schemaVersion: 1 as const,
    id: "842ea782-ded2-4c04-a442-e5125a18d251",
    title: "Ad-Duhaa 1-2",
    quran: { surahId: 93, surahName: "Surah Ad-Duhaa", verseNumbers: [1, 2] },
    segments: [
      { id: "d7dd3005-0143-41d8-a5ad-5d2ad9814458", verseNumber: 1, start: 0, end: 2, arabic: "وَٱلضُّحَىٰ", translation: "By the morning sunlight" },
      { id: "304fe762-fc85-477e-9530-74e67fc76e0f", verseNumber: 2, start: 2, end: 4, arabic: "وَٱلَّيْلِ إِذَا سَجَىٰ", translation: "And the night when it falls still" },
    ],
    style: { layout: "sideFade" as const, captionStyle: "softGlow" as const, arabicSize: 36, translationSize: 15, overlayOpacity: 0.35 },
    media: [{ id: "opaque", url: "ayahclip-media://asset/opaque", contentType: "video/mp4", fileSize: 1234 }],
    createdAtMilliseconds: 1,
    updatedAtMilliseconds: 2,
  };
}
