import { describe, expect, it } from "vitest";
import { buildProductEventLog, parseProductEvent } from "../telemetry-schema";

const valid = {
  event: "export_succeeded",
  journeyId: "6bbbf0a1-76a4-44bf-9e3c-8c83a9b1b114",
  path: "/studio",
  deviceClass: "phone",
  browserFamily: "webkit",
  durationBucket: "3_to_10m",
  exportAction: "download",
  exportPath: "realtime",
} as const;

describe("privacy-safe product telemetry", () => {
  it("accepts the documented coarse event vocabulary", () => {
    expect(parseProductEvent(valid)).toEqual(valid);
  });

  it("drops unknown fields rather than retaining creator content", () => {
    expect(parseProductEvent({
      ...valid,
      fileName: "private-recitation.mov",
      transcript: "creator transcript",
      errorMessage: "a free-form local exception",
      quranText: "text must remain local",
    })).toEqual(valid);
  });

  it("keeps only fields meaningful to each event", () => {
    expect(parseProductEvent({
      ...valid,
      event: "journey_started",
      firstVisit: true,
      exportPath: "webcodecs",
      exportAction: "download",
      outcome: "needed_help",
      errorCode: "media_failure",
    })).toEqual({
      event: "journey_started",
      journeyId: valid.journeyId,
      path: valid.path,
      deviceClass: valid.deviceClass,
      browserFamily: valid.browserFamily,
      firstVisit: true,
    });
  });

  it("requires outcome, source and export dimensions when their events need them", () => {
    expect(parseProductEvent({ ...valid, event: "source_loaded", sourceKind: undefined })).toBeNull();
    expect(parseProductEvent({ ...valid, event: "export_started", exportAction: undefined })).toBeNull();
    expect(parseProductEvent({ ...valid, event: "export_succeeded", exportPath: undefined })).toBeNull();
    expect(parseProductEvent({ ...valid, event: "export_failed", errorCode: undefined })).toBeNull();
    expect(parseProductEvent({ ...valid, event: "client_error", errorCode: undefined })).toBeNull();
    expect(parseProductEvent({ ...valid, event: "journey_feedback", outcome: undefined })).toBeNull();
  });

  it("rejects arbitrary event names, identifiers, paths, and free-form codes", () => {
    expect(parseProductEvent({ ...valid, event: "uploaded_media" })).toBeNull();
    expect(parseProductEvent({ ...valid, journeyId: "short" })).toBeNull();
    expect(parseProductEvent({ ...valid, path: "/studio?file=private.mov" })).toBeNull();
    expect(parseProductEvent({ ...valid, errorCode: "raw exception: private.mov" }))
      .toEqual({ ...valid });
  });

  it("accepts only the two first-export assistance outcomes", () => {
    expect(parseProductEvent({ ...valid, event: "journey_feedback", outcome: "without_help" }))
      .toMatchObject({ event: "journey_feedback", outcome: "without_help" });
    expect(parseProductEvent({ ...valid, event: "journey_feedback", outcome: "tell me more" }))
      .toBeNull();
  });

  it("wraps accepted events in a versioned analytics envelope", () => {
    expect(buildProductEventLog(valid, new Date("2026-07-18T06:00:00.000Z"))).toEqual({
      type: "ayahclip_product_event",
      schemaVersion: 1,
      receivedAt: "2026-07-18T06:00:00.000Z",
      ...valid,
    });
  });
});
