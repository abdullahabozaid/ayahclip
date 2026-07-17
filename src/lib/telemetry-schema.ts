export const PRODUCT_EVENT_NAMES = [
  "journey_started",
  "source_loaded",
  "range_confirmed",
  "template_chosen",
  "studio_opened",
  "export_started",
  "export_succeeded",
  "export_failed",
  "journey_feedback",
  "client_error",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];
export type DurationBucket = "under_1m" | "1_to_3m" | "3_to_10m" | "over_10m";
export type DeviceClass = "phone" | "tablet" | "desktop";
export type BrowserFamily = "chromium" | "webkit" | "firefox" | "other";
export type ExportPath = "webcodecs" | "realtime" | "cache";
export type ExportAction = "preview" | "download";

export interface ProductEventPayload {
  event: ProductEventName;
  journeyId: string;
  path: string;
  deviceClass: DeviceClass;
  browserFamily: BrowserFamily;
  firstVisit?: boolean;
  sourceKind?: "audio" | "video";
  durationBucket?: DurationBucket;
  exportPath?: ExportPath;
  exportAction?: ExportAction;
  errorCode?: string;
  outcome?: "without_help" | "needed_help";
}

const EVENT_SET = new Set<string>(PRODUCT_EVENT_NAMES);
const DEVICE_SET = new Set<string>(["phone", "tablet", "desktop"]);
const BROWSER_SET = new Set<string>(["chromium", "webkit", "firefox", "other"]);
const DURATION_SET = new Set<string>(["under_1m", "1_to_3m", "3_to_10m", "over_10m"]);
const EXPORT_PATH_SET = new Set<string>(["webcodecs", "realtime", "cache"]);
const EXPORT_ACTION_SET = new Set<string>(["preview", "download"]);
const JOURNEY_ID = /^[a-zA-Z0-9-]{12,64}$/;
const SAFE_PATH = /^\/[a-zA-Z0-9_/:.-]{0,80}$/;
const SAFE_CODE = /^[a-z0-9_]{2,40}$/;

/** Strictly accept the small, documented event vocabulary. Unknown keys are
 * discarded so future UI mistakes cannot leak file names, Quran text, URLs,
 * transcripts, free-form error messages, or any other creator content. */
export function parseProductEvent(input: unknown): ProductEventPayload | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.event !== "string" || !EVENT_SET.has(value.event)) return null;
  if (typeof value.journeyId !== "string" || !JOURNEY_ID.test(value.journeyId)) return null;
  if (typeof value.path !== "string" || !SAFE_PATH.test(value.path)) return null;
  if (typeof value.deviceClass !== "string" || !DEVICE_SET.has(value.deviceClass)) return null;
  if (typeof value.browserFamily !== "string" || !BROWSER_SET.has(value.browserFamily)) return null;

  const payload: ProductEventPayload = {
    event: value.event as ProductEventName,
    journeyId: value.journeyId,
    path: value.path,
    deviceClass: value.deviceClass as DeviceClass,
    browserFamily: value.browserFamily as BrowserFamily,
  };
  if (typeof value.firstVisit === "boolean") payload.firstVisit = value.firstVisit;
  if (value.sourceKind === "audio" || value.sourceKind === "video") payload.sourceKind = value.sourceKind;
  if (typeof value.durationBucket === "string" && DURATION_SET.has(value.durationBucket)) {
    payload.durationBucket = value.durationBucket as DurationBucket;
  }
  if (typeof value.exportPath === "string" && EXPORT_PATH_SET.has(value.exportPath)) {
    payload.exportPath = value.exportPath as ExportPath;
  }
  if (typeof value.exportAction === "string" && EXPORT_ACTION_SET.has(value.exportAction)) {
    payload.exportAction = value.exportAction as ExportAction;
  }
  if (typeof value.errorCode === "string" && SAFE_CODE.test(value.errorCode)) {
    payload.errorCode = value.errorCode;
  }
  if (value.outcome === "without_help" || value.outcome === "needed_help") {
    payload.outcome = value.outcome;
  }
  return payload;
}
