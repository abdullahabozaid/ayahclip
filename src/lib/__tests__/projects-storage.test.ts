import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setMock } = vi.hoisted(() => ({ setMock: vi.fn() }));

vi.mock("idb-keyval", () => ({
  set: setMock,
  get: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  getMany: vi.fn(),
}));

import { saveBlob, saveProject } from "../projects";

describe("project storage result", () => {
  beforeEach(() => {
    setMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports successful project and media writes", async () => {
    setMock.mockResolvedValue(undefined);
    expect(await saveProject({ id: "ok" } as never)).toBe(true);
    expect(await saveBlob("audio:ok", new Blob(["audio"]))).toBe(true);
  });

  it("reports quota/private-mode failures instead of presenting a false save", async () => {
    setMock.mockImplementation(async () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(await saveProject({ id: "full" } as never)).toBe(false);
    expect(await saveBlob("audio:full", new Blob(["audio"]))).toBe(false);
  });
});
