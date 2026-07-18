import { beforeEach, describe, expect, it, vi } from "vitest";

const { storage, getMock, setMock, delMock } = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  getMock: vi.fn(),
  setMock: vi.fn(),
  delMock: vi.fn(),
}));

vi.mock("idb-keyval", () => ({
  get: getMock,
  set: setMock,
  del: delMock,
}));

import {
  deleteBrollAsset,
  getBrollAssetBlob,
  listBrollAssets,
  saveBrollAsset,
} from "../broll-library";

describe("personal B-roll library", () => {
  beforeEach(() => {
    storage.clear();
    getMock.mockReset();
    setMock.mockReset();
    delMock.mockReset();
    getMock.mockImplementation(async (key: string) => storage.get(key));
    setMock.mockImplementation(async (key: string, value: unknown) => storage.set(key, value));
    delMock.mockImplementation(async (key: string) => storage.delete(key));
  });

  it("stores reusable image and video metadata alongside the original blob", async () => {
    const image = new File(["image"], "waterfall.jpg", { type: "image/jpeg" });
    const video = new File(["video"], "night-drive.mp4", { type: "video/mp4" });

    const first = await saveBrollAsset(image);
    const second = await saveBrollAsset(video);
    const assets = await listBrollAssets();

    expect(assets.map((asset) => asset.name)).toEqual(["night-drive.mp4", "waterfall.jpg"]);
    expect(first?.type).toBe("image");
    expect(second?.type).toBe("video");
    expect(await getBrollAssetBlob(first!.id)).toBe(image);
  });

  it("removes both metadata and media only after the caller confirms", async () => {
    const asset = await saveBrollAsset(new File(["sky"], "clouds.jpg", { type: "image/jpeg" }));
    expect(await deleteBrollAsset(asset!.id)).toBe(true);
    expect(await listBrollAssets()).toEqual([]);
    expect(await getBrollAssetBlob(asset!.id)).toBeUndefined();
  });

  it("returns a truthful failure when browser storage rejects the write", async () => {
    setMock.mockRejectedValueOnce(new DOMException("Quota exceeded", "QuotaExceededError"));
    expect(await saveBrollAsset(new File(["x"], "large.mp4", { type: "video/mp4" }))).toBeNull();
  });
});
