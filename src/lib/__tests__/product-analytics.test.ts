import { describe, expect, it } from "vitest";

import {
  analyzeProductEventJsonl,
  formatProductAnalyticsMarkdown,
} from "../product-analytics";
import { buildProductEventLog, type ProductEventPayload } from "../telemetry-schema";

const JOURNEY_A = "11111111-1111-4111-8111-111111111111";
const JOURNEY_B = "22222222-2222-4222-8222-222222222222";

function event(
  receivedAt: string,
  payload: ProductEventPayload,
  wrap = true
): string {
  const message = JSON.stringify(buildProductEventLog(payload, new Date(receivedAt)));
  return wrap ? JSON.stringify({ id: crypto.randomUUID(), message }) : message;
}

const base = {
  path: "/import",
  deviceClass: "phone",
  browserFamily: "webkit",
} as const;

describe("privacy-safe product analytics", () => {
  it("builds a deduplicated funnel and export-health report from Vercel JSONL", () => {
    const rows = [
      event("2026-07-18T10:00:00Z", {
        ...base, event: "journey_started", journeyId: JOURNEY_A, firstVisit: true,
      }),
      event("2026-07-18T10:00:05Z", {
        ...base, event: "source_loaded", journeyId: JOURNEY_A,
        sourceKind: "video", durationBucket: "1_to_3m",
      }),
      event("2026-07-18T10:00:10Z", {
        ...base, event: "range_confirmed", journeyId: JOURNEY_A,
      }),
      event("2026-07-18T10:00:20Z", {
        ...base, event: "studio_opened", journeyId: JOURNEY_A,
      }),
      event("2026-07-18T10:01:00Z", {
        ...base, path: "/studio", event: "export_started", journeyId: JOURNEY_A,
        exportAction: "download",
      }),
      event("2026-07-18T10:02:00Z", {
        ...base, path: "/studio", event: "export_succeeded", journeyId: JOURNEY_A,
        exportAction: "download", exportPath: "webcodecs",
      }),
      event("2026-07-18T10:02:05Z", {
        ...base, path: "/studio", event: "journey_feedback", journeyId: JOURNEY_A,
        outcome: "without_help",
      }),
      event("2026-07-18T11:00:00Z", {
        ...base, deviceClass: "desktop", browserFamily: "chromium",
        event: "journey_started", journeyId: JOURNEY_B, firstVisit: false,
      }, false),
      event("2026-07-18T11:00:30Z", {
        ...base, deviceClass: "desktop", browserFamily: "chromium", path: "/studio",
        event: "export_failed", journeyId: JOURNEY_B, exportAction: "preview",
        errorCode: "encoder_failure",
      }),
      "not json",
      JSON.stringify({ message: "ordinary runtime log" }),
    ];
    rows.push(rows[1]);

    const report = analyzeProductEventJsonl(
      rows.join("\n"),
      new Date("2026-07-18T12:00:00Z")
    );

    expect(report.input).toEqual({
      rows: 12,
      validEvents: 9,
      distinctJourneys: 2,
      invalidRows: 1,
      ignoredRows: 1,
      duplicateEvents: 1,
    });
    expect(report.acquisition).toEqual({
      startedJourneys: 2,
      firstVisitJourneys: 1,
      returningVisitJourneys: 1,
      unknownVisitTypeJourneys: 0,
      returningVisitPercent: 50,
    });
    expect(report.outcomes).toEqual({
      activatedJourneys: 1,
      activationPercent: 50,
      successfulExportJourneys: 1,
      successfulExportPercent: 50,
    });
    expect(report.funnel.find((row) => row.event === "export_succeeded")).toMatchObject({
      journeys: 1,
      fromStartedPercent: 50,
    });
    expect(report.exports).toMatchObject({
      attempts: 1,
      successes: 1,
      failures: 1,
      successPercent: 50,
      downloadSuccesses: 1,
      medianSecondsToFirstSuccess: 120,
      p90SecondsToFirstSuccess: 120,
      paths: { webcodecs: 1, realtime: 0, cache: 0 },
    });
    expect(report.feedback).toMatchObject({
      responses: 1,
      withoutHelp: 1,
      withoutHelpPercent: 100,
    });
    expect(report.breakdowns.devices).toEqual({ phone: 1, tablet: 0, desktop: 1 });
    expect(report.failures.exportErrors).toEqual({ encoder_failure: 1 });
  });

  it("never writes journey identifiers or creator data to the operator report", () => {
    const report = analyzeProductEventJsonl(event("2026-07-18T10:00:00Z", {
      ...base, event: "journey_started", journeyId: JOURNEY_A, firstVisit: true,
    }));
    const json = JSON.stringify(report);
    const markdown = formatProductAnalyticsMarkdown(report);

    expect(json).not.toContain(JOURNEY_A);
    expect(markdown).not.toContain(JOURNEY_A);
    expect(markdown).toContain("Privacy:");
    expect(markdown).toContain("Device · Phone");
  });

  it("returns a stable zero-state report when no product events exist", () => {
    const report = analyzeProductEventJsonl("\n");
    expect(report.input.validEvents).toBe(0);
    expect(report.exports.successPercent).toBeNull();
    expect(report.feedback.withoutHelpPercent).toBeNull();
    expect(report.acquisition.returningVisitPercent).toBeNull();
    expect(formatProductAnalyticsMarkdown(report)).toContain("no events");
  });
});
