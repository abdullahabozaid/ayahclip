import { describe, expect, it } from "vitest";
import { parseProductEvent } from "../telemetry-schema";

const valid = {
  event: "export_succeeded",
  journeyId: "6bbbf0a1-76a4-44bf-9e3c-8c83a9b1b114",
  path: "/studio",
  deviceClass: "phone",
  browserFamily: "webkit",
  durationBucket: "3_to_10m",
  exportAction: "download",
  exportPath: "realtime",
};

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
      .not.toHaveProperty("outcome");
  });
});
