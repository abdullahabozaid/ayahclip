"use client";

import type {
  BrowserFamily,
  DeviceClass,
  DurationBucket,
  ProductEventName,
  ProductEventPayload,
} from "./telemetry-schema";

const PREFERENCE_KEY = "ayahclip:anonymous-diagnostics";
const VISITED_KEY = "ayahclip:has-visited";
const JOURNEY_KEY = "ayahclip:journey-id";
const ONCE_PREFIX = "ayahclip:event:";
const FIRST_EXPORT_FEEDBACK_KEY = "ayahclip:first-export-feedback";
let fallbackJourneyId = "";
let sentCount = 0;

type EventFields = Partial<Omit<ProductEventPayload,
  "event" | "journeyId" | "path" | "deviceClass" | "browserFamily"
>>;

function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function createJourneyId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `journey-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function journeyId(): string {
  const storage = safeStorage("session");
  const existing = storage?.getItem(JOURNEY_KEY);
  if (existing) return existing;
  if (!fallbackJourneyId) fallbackJourneyId = createJourneyId();
  storage?.setItem(JOURNEY_KEY, fallbackJourneyId);
  return fallbackJourneyId;
}

function deviceClass(): DeviceClass {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && Math.min(window.innerWidth, window.innerHeight) < 600) return "phone";
  if (coarse || Math.min(window.innerWidth, window.innerHeight) < 900) return "tablet";
  return "desktop";
}

function browserFamily(): BrowserFamily {
  const ua = navigator.userAgent;
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Edg\/|Chrome\/|Chromium\/|CriOS\//i.test(ua)) return "chromium";
  if (/AppleWebKit\//i.test(ua)) return "webkit";
  return "other";
}

function safePath(): string {
  const raw = window.location.pathname || "/";
  return raw
    .replace(/^\/surah\/\d+/, "/surah/:id")
    .replace(/[^a-zA-Z0-9_/:.-]/g, "")
    .slice(0, 80) || "/";
}

export function durationBucket(seconds: number): DurationBucket {
  if (seconds < 60) return "under_1m";
  if (seconds < 180) return "1_to_3m";
  if (seconds < 600) return "3_to_10m";
  return "over_10m";
}

export function telemetryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.doNotTrack === "1") return false;
  return safeStorage("local")?.getItem(PREFERENCE_KEY) !== "off";
}

export function setTelemetryEnabled(enabled: boolean): void {
  safeStorage("local")?.setItem(PREFERENCE_KEY, enabled ? "on" : "off");
}

/** Convert a local exception into a fixed category. The original message and
 * stack stay in the browser console and are never transmitted. */
export function telemetryErrorCode(error: unknown): string {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  if (/quota|storage|indexeddb/i.test(text)) return "storage_failure";
  if (/font/i.test(text)) return "font_failure";
  if (/codec|encoder|mediarecorder|webcodecs/i.test(text)) return "encoder_failure";
  if (/decode|audio|video|media/i.test(text)) return "media_failure";
  if (/network|fetch|load|timeout/i.test(text)) return "network_failure";
  if (/abort|cancel/i.test(text)) return "cancelled";
  return "unexpected_failure";
}

export function trackProductEvent(event: ProductEventName, fields: EventFields = {}): void {
  if (!telemetryEnabled() || sentCount >= 100) return;
  sentCount += 1;
  const payload: ProductEventPayload = {
    event,
    journeyId: journeyId(),
    path: safePath(),
    deviceClass: deviceClass(),
    browserFamily: browserFamily(),
    ...fields,
  };
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(
        "/api/telemetry",
        new Blob([body], { type: "application/json" }),
      );
      if (accepted) return;
    }
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    // Diagnostics must never interrupt editing or export.
  }
}

export function trackOncePerJourney(event: ProductEventName, fields: EventFields = {}): void {
  const storage = safeStorage("session");
  const key = `${ONCE_PREFIX}${event}`;
  if (storage?.getItem(key) === "1") return;
  storage?.setItem(key, "1");
  trackProductEvent(event, fields);
}

export function startCreatorJourney(): void {
  const storage = safeStorage("local");
  const firstVisit = storage?.getItem(VISITED_KEY) !== "1";
  storage?.setItem(VISITED_KEY, "1");
  trackOncePerJourney("journey_started", { firstVisit });
}

export function firstExportFeedbackPending(): boolean {
  return telemetryEnabled() && safeStorage("local")?.getItem(FIRST_EXPORT_FEEDBACK_KEY) !== "done";
}

export function submitFirstExportFeedback(outcome: "without_help" | "needed_help"): void {
  safeStorage("local")?.setItem(FIRST_EXPORT_FEEDBACK_KEY, "done");
  trackProductEvent("journey_feedback", { outcome });
}
