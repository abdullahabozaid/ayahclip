import {
  parseProductEvent,
  type BrowserFamily,
  type DeviceClass,
  type DurationBucket,
  type ExportPath,
  type ProductEventName,
  type ProductEventPayload,
} from "./telemetry-schema";

const FUNNEL_EVENTS = [
  "journey_started",
  "source_loaded",
  "range_confirmed",
  "template_chosen",
  "studio_opened",
  "export_succeeded",
] as const satisfies readonly ProductEventName[];

interface TimedProductEvent {
  receivedAt: string;
  timestampMs: number;
  payload: ProductEventPayload;
}

export interface FunnelRow {
  event: (typeof FUNNEL_EVENTS)[number];
  journeys: number;
  fromStartedPercent: number | null;
  fromPreviousPercent: number | null;
}

export interface ProductAnalyticsReport {
  schemaVersion: 1;
  generatedAt: string;
  window: { firstEventAt: string | null; lastEventAt: string | null };
  input: {
    rows: number;
    validEvents: number;
    distinctJourneys: number;
    invalidRows: number;
    ignoredRows: number;
    duplicateEvents: number;
  };
  acquisition: {
    startedJourneys: number;
    firstVisitJourneys: number;
    returningVisitJourneys: number;
    unknownVisitTypeJourneys: number;
    returningVisitPercent: number | null;
  };
  outcomes: {
    activatedJourneys: number;
    activationPercent: number | null;
    successfulExportJourneys: number;
    successfulExportPercent: number | null;
  };
  funnel: FunnelRow[];
  exports: {
    attempts: number;
    successes: number;
    failures: number;
    successPercent: number | null;
    previewSuccesses: number;
    downloadSuccesses: number;
    medianSecondsToFirstSuccess: number | null;
    p90SecondsToFirstSuccess: number | null;
    paths: Record<ExportPath, number>;
  };
  feedback: {
    responses: number;
    withoutHelp: number;
    neededHelp: number;
    withoutHelpPercent: number | null;
  };
  breakdowns: {
    devices: Record<DeviceClass, number>;
    browsers: Record<BrowserFamily, number>;
    sourceKinds: Record<"audio" | "video", number>;
    durationBuckets: Record<DurationBucket, number>;
  };
  failures: {
    exportErrors: Record<string, number>;
    clientErrors: Record<string, number>;
  };
}

type ParseResult =
  | { kind: "event"; event: TimedProductEvent }
  | { kind: "ignored" }
  | { kind: "invalid" };

function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function increment<T extends string>(record: Record<T, number>, key: T): void {
  record[key] += 1;
}

function incrementOpen(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function parseLine(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "ignored" };

  let outer: unknown;
  try {
    outer = JSON.parse(trimmed);
  } catch {
    return { kind: "invalid" };
  }
  if (!outer || typeof outer !== "object" || Array.isArray(outer)) {
    return { kind: "invalid" };
  }

  const outerRecord = outer as Record<string, unknown>;
  let candidate: unknown = outerRecord;
  if (typeof outerRecord.message === "string") {
    try {
      candidate = JSON.parse(outerRecord.message);
    } catch {
      return { kind: "ignored" };
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { kind: "ignored" };
  }

  const envelope = candidate as Record<string, unknown>;
  if (envelope.type !== "ayahclip_product_event") return { kind: "ignored" };
  if (envelope.schemaVersion !== 1 || typeof envelope.receivedAt !== "string") {
    return { kind: "invalid" };
  }
  const timestampMs = Date.parse(envelope.receivedAt);
  const payload = parseProductEvent(envelope);
  if (!Number.isFinite(timestampMs) || !payload) return { kind: "invalid" };
  return {
    kind: "event",
    event: { receivedAt: new Date(timestampMs).toISOString(), timestampMs, payload },
  };
}

function percentile(values: readonly number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return Number(sorted[index].toFixed(1));
}

/**
 * Turns Vercel JSONL Runtime Logs into aggregate, identity-free launch metrics.
 * Journey IDs are used only in memory for deduplication and funnel grouping and
 * are deliberately absent from the returned report.
 */
export function analyzeProductEventJsonl(
  jsonl: string,
  generatedAt = new Date()
): ProductAnalyticsReport {
  const lines = jsonl.split(/\r?\n/);
  let invalidRows = 0;
  let ignoredRows = 0;
  let duplicateEvents = 0;
  const events: TimedProductEvent[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed.kind === "invalid") {
      invalidRows += 1;
      continue;
    }
    if (parsed.kind === "ignored") {
      if (line.trim()) ignoredRows += 1;
      continue;
    }
    const key = JSON.stringify([parsed.event.receivedAt, parsed.event.payload]);
    if (seen.has(key)) {
      duplicateEvents += 1;
      continue;
    }
    seen.add(key);
    events.push(parsed.event);
  }
  events.sort((a, b) => a.timestampMs - b.timestampMs);

  const journeyEvents = new Map<string, TimedProductEvent[]>();
  for (const event of events) {
    const journey = journeyEvents.get(event.payload.journeyId) ?? [];
    journey.push(event);
    journeyEvents.set(event.payload.journeyId, journey);
  }

  const startedJourneys = new Set<string>();
  const firstVisitJourneys = new Set<string>();
  const returningVisitJourneys = new Set<string>();
  const knownVisitTypeJourneys = new Set<string>();
  const stageJourneys = new Map<ProductEventName, Set<string>>();
  for (const stage of FUNNEL_EVENTS) stageJourneys.set(stage, new Set());

  const devices: Record<DeviceClass, number> = { phone: 0, tablet: 0, desktop: 0 };
  const browsers: Record<BrowserFamily, number> = {
    chromium: 0,
    webkit: 0,
    firefox: 0,
    other: 0,
  };
  const sourceKinds: Record<"audio" | "video", number> = { audio: 0, video: 0 };
  const durationBuckets: Record<DurationBucket, number> = {
    under_1m: 0,
    "1_to_3m": 0,
    "3_to_10m": 0,
    over_10m: 0,
  };
  const paths: Record<ExportPath, number> = { webcodecs: 0, realtime: 0, cache: 0 };
  const exportErrors: Record<string, number> = {};
  const clientErrors: Record<string, number> = {};
  let attempts = 0;
  let successes = 0;
  let failures = 0;
  let previewSuccesses = 0;
  let downloadSuccesses = 0;
  let withoutHelp = 0;
  let neededHelp = 0;

  for (const [journeyId, journey] of journeyEvents) {
    const first = journey[0];
    increment(devices, first.payload.deviceClass);
    increment(browsers, first.payload.browserFamily);
    for (const event of journey) {
      stageJourneys.get(event.payload.event)?.add(journeyId);
      if (event.payload.event === "journey_started") {
        startedJourneys.add(journeyId);
        if (typeof event.payload.firstVisit === "boolean") {
          knownVisitTypeJourneys.add(journeyId);
          if (event.payload.firstVisit) firstVisitJourneys.add(journeyId);
          else returningVisitJourneys.add(journeyId);
        }
      }
    }
  }

  for (const { payload } of events) {
    if (payload.event === "source_loaded") increment(sourceKinds, payload.sourceKind!);
    if (payload.durationBucket) increment(durationBuckets, payload.durationBucket);
    if (payload.event === "export_started") attempts += 1;
    if (payload.event === "export_succeeded") {
      successes += 1;
      increment(paths, payload.exportPath!);
      if (payload.exportAction === "preview") previewSuccesses += 1;
      if (payload.exportAction === "download") downloadSuccesses += 1;
    }
    if (payload.event === "export_failed") {
      failures += 1;
      incrementOpen(exportErrors, payload.errorCode!);
    }
    if (payload.event === "client_error") incrementOpen(clientErrors, payload.errorCode!);
    if (payload.event === "journey_feedback") {
      if (payload.outcome === "without_help") withoutHelp += 1;
      if (payload.outcome === "needed_help") neededHelp += 1;
    }
  }

  const timeToSuccessSeconds: number[] = [];
  for (const journey of journeyEvents.values()) {
    const start = journey.find(({ payload }) => payload.event === "journey_started");
    const success = journey.find(({ payload, timestampMs }) =>
      payload.event === "export_succeeded" && (!start || timestampMs >= start.timestampMs)
    );
    if (start && success) {
      timeToSuccessSeconds.push((success.timestampMs - start.timestampMs) / 1_000);
    }
  }

  const funnel: FunnelRow[] = FUNNEL_EVENTS.map((event, index) => {
    const journeys = stageJourneys.get(event)?.size ?? 0;
    const previous = index === 0
      ? startedJourneys.size
      : (stageJourneys.get(FUNNEL_EVENTS[index - 1])?.size ?? 0);
    return {
      event,
      journeys,
      fromStartedPercent: percentage(journeys, startedJourneys.size),
      fromPreviousPercent: index === 0 ? null : percentage(journeys, previous),
    };
  });
  const responses = withoutHelp + neededHelp;
  const activatedJourneys = stageJourneys.get("source_loaded")?.size ?? 0;
  const successfulExportJourneys = stageJourneys.get("export_succeeded")?.size ?? 0;

  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    window: {
      firstEventAt: events[0]?.receivedAt ?? null,
      lastEventAt: events.at(-1)?.receivedAt ?? null,
    },
    input: {
      rows: lines.filter((line) => line.trim()).length,
      validEvents: events.length,
      distinctJourneys: journeyEvents.size,
      invalidRows,
      ignoredRows,
      duplicateEvents,
    },
    acquisition: {
      startedJourneys: startedJourneys.size,
      firstVisitJourneys: firstVisitJourneys.size,
      returningVisitJourneys: returningVisitJourneys.size,
      unknownVisitTypeJourneys: startedJourneys.size - knownVisitTypeJourneys.size,
      returningVisitPercent: percentage(returningVisitJourneys.size, knownVisitTypeJourneys.size),
    },
    outcomes: {
      activatedJourneys,
      activationPercent: percentage(activatedJourneys, startedJourneys.size),
      successfulExportJourneys,
      successfulExportPercent: percentage(successfulExportJourneys, startedJourneys.size),
    },
    funnel,
    exports: {
      attempts,
      successes,
      failures,
      successPercent: percentage(successes, successes + failures),
      previewSuccesses,
      downloadSuccesses,
      medianSecondsToFirstSuccess: percentile(timeToSuccessSeconds, 0.5),
      p90SecondsToFirstSuccess: percentile(timeToSuccessSeconds, 0.9),
      paths,
    },
    feedback: {
      responses,
      withoutHelp,
      neededHelp,
      withoutHelpPercent: percentage(withoutHelp, responses),
    },
    breakdowns: { devices, browsers, sourceKinds, durationBuckets },
    failures: { exportErrors, clientErrors },
  };
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function seconds(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}s`;
}

function readableEvent(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function countRows(values: Record<string, number>): string[] {
  return Object.entries(values)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `| ${readableEvent(name)} | ${count} |`);
}

function breakdownRows(
  group: string,
  values: Record<string, number>
): string[] {
  return countRows(values).map((row) => row.replace("| ", `| ${group} · `));
}

export function formatProductAnalyticsMarkdown(report: ProductAnalyticsReport): string {
  const funnelRows = report.funnel.map((row) =>
    `| ${readableEvent(row.event)} | ${row.journeys} | ${percent(row.fromStartedPercent)} | ${percent(row.fromPreviousPercent)} |`
  );
  const failureRows = [
    ...countRows(report.failures.exportErrors).map((row) => row.replace("| ", "| Export · ")),
    ...countRows(report.failures.clientErrors).map((row) => row.replace("| ", "| Client · ")),
  ];
  return [
    "# AyahClip product analytics",
    "",
    `Generated: ${report.generatedAt}`,
    `Event window: ${report.window.firstEventAt ?? "no events"} → ${report.window.lastEventAt ?? "no events"}`,
    "",
    `Journeys: **${report.input.distinctJourneys}** · Started: **${report.acquisition.startedJourneys}** · First visits: **${report.acquisition.firstVisitJourneys}** · Returning visits: **${report.acquisition.returningVisitJourneys}** (${percent(report.acquisition.returningVisitPercent)})`,
    `Activation: **${report.outcomes.activatedJourneys}** (${percent(report.outcomes.activationPercent)}) · Successful-export journeys: **${report.outcomes.successfulExportJourneys}** (${percent(report.outcomes.successfulExportPercent)})`,
    "",
    "## Creator funnel",
    "",
    "| Milestone | Journeys | From started | From previous |",
    "| --- | ---: | ---: | ---: |",
    ...funnelRows,
    "",
    "## Export health",
    "",
    `Attempts: **${report.exports.attempts}** · Successes: **${report.exports.successes}** · Failures: **${report.exports.failures}** · Completed: **${percent(report.exports.successPercent)}**`,
    `Preview successes: **${report.exports.previewSuccesses}** · Download successes: **${report.exports.downloadSuccesses}**`,
    `Time to first successful export: median **${seconds(report.exports.medianSecondsToFirstSuccess)}** · p90 **${seconds(report.exports.p90SecondsToFirstSuccess)}**`,
    "",
    "## First-export feedback",
    "",
    `Responses: **${report.feedback.responses}** · Without help: **${report.feedback.withoutHelp}** · Needed help: **${report.feedback.neededHelp}** · Unassisted: **${percent(report.feedback.withoutHelpPercent)}**`,
    "",
    "## Audience and sources",
    "",
    "| Segment | Count |",
    "| --- | ---: |",
    ...breakdownRows("Device", report.breakdowns.devices),
    ...breakdownRows("Browser", report.breakdowns.browsers),
    ...breakdownRows("Source", report.breakdowns.sourceKinds),
    ...breakdownRows("Duration", report.breakdowns.durationBuckets),
    "",
    "## Failures",
    "",
    "| Category | Count |",
    "| --- | ---: |",
    ...(failureRows.length ? failureRows : ["| None recorded | 0 |"]),
    "",
    "## Data quality",
    "",
    `Accepted events: **${report.input.validEvents}** · Invalid rows: **${report.input.invalidRows}** · Ignored rows: **${report.input.ignoredRows}** · Duplicates removed: **${report.input.duplicateEvents}**`,
    `Unknown first/returning classification: **${report.acquisition.unknownVisitTypeJourneys}** started journeys`,
    "",
    "> Privacy: this aggregate report never includes journey IDs, IP addresses, filenames, URLs, Quran text, transcripts, or raw errors.",
    "",
  ].join("\n");
}
