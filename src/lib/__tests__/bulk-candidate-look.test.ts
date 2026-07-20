import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("idb-keyval", () => ({
  set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
  get: vi.fn(async (key: string) => store.get(key)),
  del: vi.fn(async (key: string) => { store.delete(key); }),
  keys: vi.fn(async () => [...store.keys()]),
  getMany: vi.fn(async (ks: string[]) => ks.map((k) => store.get(k))),
}));

import { createBulkJob, loadBulkJob, saveBulkJob } from "../bulk-jobs";
import type { BulkClipCandidate } from "../bulk-clips";
import type { StyleSnapshot } from "../style-snapshot";
import { captureDurableStyleSnapshot } from "../style-snapshot";
import { useAppStore } from "../store";

const candidate = (over: Partial<BulkClipCandidate> = {}): BulkClipCandidate => ({
  id: "cand-1",
  order: 1,
  surah: 1,
  ayahStart: 1,
  ayahEnd: 2,
  start: 0,
  end: 12,
  duration: 12,
  timings: [],
  confidence: "high",
  templateId: "ayahclip-gold-line",
  approved: false,
  ...over,
});

const snapshot = (includeMedia: boolean): StyleSnapshot => ({
  settings: { textColor: "#abcdef" } as StyleSnapshot["settings"],
  extras: {},
  includeMedia,
  capturedAt: 1,
});

// An individual bulk clip's edited look must survive leaving and reopening
// the collection — this was the "bulk create media changes back" bug: the
// candidate had no persisted look, so every reopen rebuilt it from the
// batch defaults.
describe("bulk candidate per-clip look persistence", () => {
  beforeEach(() => store.clear());

  it("round-trips candidate.styleOverride through save/load", async () => {
    const job = createBulkJob({
      source: new File(["m"], "r.mp4", { type: "video/mp4" }),
      duration: 60,
      requestedCount: 15,
      templateId: "ayahclip-gold-line",
    });
    job.candidates = [candidate({ styleOverride: snapshot(true) })];
    await saveBulkJob(job);
    const loaded = await loadBulkJob(job.id);
    expect(loaded?.candidates[0]?.styleOverride).toMatchObject({
      includeMedia: true,
      settings: { textColor: "#abcdef" },
    });
  });

  it("loads legacy candidates without the field", async () => {
    const job = createBulkJob({
      source: new File(["m"], "r.mp4", { type: "video/mp4" }),
      duration: 60,
      requestedCount: 15,
      templateId: "ayahclip-gold-line",
    });
    job.candidates = [candidate()];
    await saveBulkJob(job);
    const loaded = await loadBulkJob(job.id);
    expect(loaded?.candidates[0]).toBeTruthy();
    expect(loaded?.candidates[0]?.styleOverride).toBeUndefined();
  });
});

describe("captureDurableStyleSnapshot media inclusion", () => {
  it("includes durable (non-blob) backgrounds", () => {
    useAppStore.setState({
      background: { type: "image", value: "/backgrounds/artistic/kaaba.webp", label: "Kaaba" },
      backgroundSequenceEnabled: false,
    });
    expect(captureDurableStyleSnapshot().includeMedia).toBe(true);
  });

  it("excludes session-scoped blob backgrounds", () => {
    useAppStore.setState({
      background: { type: "video", value: "blob:http://localhost/abc", label: "source" },
      backgroundSequenceEnabled: false,
    });
    expect(captureDurableStyleSnapshot().includeMedia).toBe(false);
  });

  it("excludes scene sequences (scene media is blob-backed)", () => {
    useAppStore.setState({
      background: { type: "image", value: "/backgrounds/artistic/kaaba.webp", label: "Kaaba" },
      backgroundSequenceEnabled: true,
    });
    expect(captureDurableStyleSnapshot().includeMedia).toBe(false);
  });
});
