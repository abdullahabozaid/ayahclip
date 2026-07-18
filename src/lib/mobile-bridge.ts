export const MOBILE_BRIDGE_PROTOCOL_VERSION = 1 as const;
export const MOBILE_EDITOR_ORIGIN = "https://ayahclip.com" as const;

export const MOBILE_BRIDGE_MESSAGE_TYPES = [
  "ready",
  "hydrateProject",
  "projectChanged",
  "requestMediaImport",
  "mediaImported",
  "detectionProgress",
  "detectionResult",
  "requestExport",
  "exportChunk",
  "exportComplete",
  "exportCancel",
  "exportReady",
  "error",
] as const;

export type MobileBridgeMessageType = (typeof MOBILE_BRIDGE_MESSAGE_TYPES)[number];

export interface MobileBridgeEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  protocolVersion: typeof MOBILE_BRIDGE_PROTOCOL_VERSION;
  id: string;
  type: MobileBridgeMessageType;
  payload: T;
}

export interface MobileDetectionResultPayload extends Record<string, unknown> {
  surahId: number;
  ayahStart: number;
  ayahEnd: number;
  confidence: "high" | "medium" | "low" | "selected";
  reviewVerseNumbers: number[];
  alternatives: Array<{
    surahId: number;
    ayahStart: number;
    ayahEnd: number;
    confidence: number;
  }>;
}

export interface MobileExportReadyPayload extends Record<string, unknown> {
  exportId: string;
  status: "ready" | "complete" | "cancelled";
  chunkSize: number;
  fileName?: string | null;
}

export interface MobileMediaImportRequestPayload extends Record<string, unknown> {
  kinds: Array<"image" | "video" | "audio">;
  maxCount: number;
  purpose: "primary" | "broll" | "replacement";
}

export interface MobileMediaImportResultPayload extends Record<string, unknown> {
  media: MobileProjectSnapshotV1["media"];
}

export interface MobileProjectSnapshotV1 extends Record<string, unknown> {
  schemaVersion: 1;
  id: string;
  title: string;
  quran: null | {
    surahId: number;
    surahName: string;
    verseNumbers: number[];
    reciterId?: string | null;
  };
  segments: Array<{
    id: string;
    verseNumber: number;
    start: number;
    end: number;
    arabic: string;
    translation: string;
  }>;
  style: {
    layout: "centered" | "sideFade" | "lowerThird";
    captionStyle: "softGlow" | "crispOutline" | "gold" | "clean";
    arabicSize: number;
    translationSize: number;
    overlayOpacity: number;
  };
  media: Array<{
    id: string;
    url: string;
    contentType: string;
    fileSize: number;
  }>;
  sourceReferenceURL?: string | null;
  editorDocumentJSON?: string | null;
  createdAtMilliseconds: number;
  updatedAtMilliseconds: number;
}

export interface NativeMobileBridgeHandler {
  postMessage(message: MobileBridgeEnvelope): unknown | Promise<unknown>;
}

type NativeMediaImportListener = (
  media: MobileProjectSnapshotV1["media"],
) => void;

const nativeMediaImportListeners = new Set<NativeMediaImportListener>();

export function subscribeNativeMediaImports(
  listener: NativeMediaImportListener,
): () => void {
  nativeMediaImportListeners.add(listener);
  return () => nativeMediaImportListeners.delete(listener);
}

export function nativeMobileBridgeAvailable(
  handler: NativeMobileBridgeHandler | undefined = typeof window === "undefined"
    ? undefined
    : window.webkit?.messageHandlers?.ayahclipBridge,
): boolean {
  return Boolean(handler);
}

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        ayahclipBridge?: NativeMobileBridgeHandler;
      };
    };
  }
}

export function mobileEditorURL(
  projectId?: string,
  requiresPassageSelection = false,
): URL {
  const url = new URL(requiresPassageSelection ? "/import" : "/studio", MOBILE_EDITOR_ORIGIN);
  url.searchParams.set("native", "ios");
  url.searchParams.set("bridge", String(MOBILE_BRIDGE_PROTOCOL_VERSION));
  if (projectId) url.searchParams.set("project", projectId);
  return url;
}

export function isNativeMobileEditor(search: string): boolean {
  const query = new URLSearchParams(search);
  return query.get("native") === "ios"
    && query.get("bridge") === String(MOBILE_BRIDGE_PROTOCOL_VERSION);
}

export function createMobileBridgeEnvelope<T extends Record<string, unknown>>(
  type: MobileBridgeMessageType,
  payload: T,
  id: string = crypto.randomUUID(),
): MobileBridgeEnvelope<T> {
  return { protocolVersion: MOBILE_BRIDGE_PROTOCOL_VERSION, id, type, payload };
}

export async function requestNativeProjectHydration(
  rendererVersion: string,
  capabilities: string[],
  handler: NativeMobileBridgeHandler | undefined = typeof window === "undefined"
    ? undefined
    : window.webkit?.messageHandlers?.ayahclipBridge,
): Promise<MobileProjectSnapshotV1 | null> {
  if (!handler) return null;
  const ready = createMobileBridgeEnvelope("ready", { rendererVersion, capabilities });
  const reply = parseMobileBridgeEnvelope(await handler.postMessage(ready));
  if (!reply || reply.type !== "hydrateProject" || !isMobileProjectSnapshotV1(reply.payload)) {
    throw new Error("AyahClip native editor returned an incompatible project.");
  }
  return reply.payload;
}

export async function sendNativeProjectChange(
  snapshot: MobileProjectSnapshotV1,
  handler: NativeMobileBridgeHandler | undefined = typeof window === "undefined"
    ? undefined
    : window.webkit?.messageHandlers?.ayahclipBridge,
): Promise<boolean> {
  if (!handler) return false;
  if (!isMobileProjectSnapshotV1(snapshot)) {
    throw new Error("AyahClip refused to send an invalid project update.");
  }
  await handler.postMessage(createMobileBridgeEnvelope("projectChanged", snapshot));
  return true;
}

export async function sendNativeExport(
  file: File,
  onProgress?: (sentBytes: number, totalBytes: number) => void,
  handler: NativeMobileBridgeHandler | undefined = typeof window === "undefined"
    ? undefined
    : window.webkit?.messageHandlers?.ayahclipBridge,
): Promise<MobileExportReadyPayload | null> {
  if (!handler) return null;
  if (file.size <= 0 || file.size > 500 * 1_024 * 1_024
    || file.type !== "video/mp4"
    || !file.name.toLowerCase().endsWith(".mp4")) {
    throw new Error("AyahClip cannot transfer that rendered video to the iPhone.");
  }
  const proposedChunkSize = 512 * 1_024;
  const totalChunks = Math.ceil(file.size / proposedChunkSize);
  const readyEnvelope = parseMobileBridgeEnvelope(await handler.postMessage(
    createMobileBridgeEnvelope("requestExport", {
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      totalChunks,
    }),
  ));
  const ready = readyEnvelope?.type === "exportReady"
    ? parseMobileExportReady(readyEnvelope.payload)
    : null;
  if (!ready || ready.status !== "ready" || ready.chunkSize !== proposedChunkSize) {
    throw new Error("The iPhone refused the rendered video transfer.");
  }
  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * ready.chunkSize;
      const bytes = new Uint8Array(await file.slice(start, start + ready.chunkSize).arrayBuffer());
      await handler.postMessage(createMobileBridgeEnvelope("exportChunk", {
        exportId: ready.exportId,
        index,
        totalChunks,
        base64Data: bytesToBase64(bytes),
      }));
      onProgress?.(Math.min(file.size, start + bytes.byteLength), file.size);
    }
    const completedEnvelope = parseMobileBridgeEnvelope(await handler.postMessage(
      createMobileBridgeEnvelope("exportComplete", {
        exportId: ready.exportId,
        totalChunks,
      }),
    ));
    const completed = completedEnvelope?.type === "exportReady"
      ? parseMobileExportReady(completedEnvelope.payload)
      : null;
    if (!completed || completed.status !== "complete" || completed.exportId !== ready.exportId) {
      throw new Error("The iPhone could not finish receiving the rendered video.");
    }
    return completed;
  } catch (error) {
    try {
      await handler.postMessage(createMobileBridgeEnvelope("exportCancel", {
        exportId: ready.exportId,
      }));
    } catch {
      // The original transfer error is the useful failure to surface.
    }
    throw error;
  }
}

export async function requestNativeMediaImport(
  request: MobileMediaImportRequestPayload,
  handler: NativeMobileBridgeHandler | undefined = typeof window === "undefined"
    ? undefined
    : window.webkit?.messageHandlers?.ayahclipBridge,
): Promise<MobileMediaImportResultPayload | null> {
  if (!handler) return null;
  const uniqueKinds = new Set(request.kinds);
  if (request.kinds.length === 0
    || uniqueKinds.size !== request.kinds.length
    || request.kinds.some((kind) => kind !== "image" && kind !== "video" && kind !== "audio")
    || !Number.isSafeInteger(request.maxCount)
    || request.maxCount < 1
    || request.maxCount > 8
    || !["primary", "broll", "replacement"].includes(request.purpose)) {
    throw new Error("AyahClip refused an invalid native media request.");
  }
  const envelope = parseMobileBridgeEnvelope(await handler.postMessage(
    createMobileBridgeEnvelope("requestMediaImport", request),
  ));
  if (!envelope || envelope.type !== "mediaImported" || !Array.isArray(envelope.payload.media)) {
    throw new Error("The iPhone returned an invalid media selection.");
  }
  const media = envelope.payload.media;
  if (media.length === 0 || media.length > request.maxCount
    || !media.every(isMobileMediaDescriptor)) {
    throw new Error("The iPhone returned an invalid media selection.");
  }
  nativeMediaImportListeners.forEach((listener) => listener(media));
  return { media } as MobileMediaImportResultPayload;
}

function parseMobileExportReady(value: Record<string, unknown>): MobileExportReadyPayload | null {
  if (typeof value.exportId !== "string"
    || !/^[0-9a-f-]{36}$/i.test(value.exportId)
    || (value.status !== "ready" && value.status !== "complete" && value.status !== "cancelled")
    || !Number.isSafeInteger(value.chunkSize)
    || (value.chunkSize as number) <= 0
    || (value.fileName != null && typeof value.fileName !== "string")) return null;
  return value as MobileExportReadyPayload;
}

function isMobileMediaDescriptor(value: unknown): value is MobileProjectSnapshotV1["media"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && item.id.length > 0
    && item.id.length <= 128
    && item.url === `ayahclip-media://asset/${item.id}`
    && typeof item.contentType === "string"
    && item.contentType.length > 0
    && Number.isSafeInteger(item.fileSize)
    && (item.fileSize as number) >= 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const block = 32 * 1_024;
  for (let offset = 0; offset < bytes.length; offset += block) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + block));
  }
  return btoa(binary);
}

export function isAllowedMobileEditorURL(value: string | URL): boolean {
  try {
    const url = typeof value === "string" ? new URL(value) : value;
    return url.protocol === "https:"
      && (url.hostname === "ayahclip.com" || url.hostname === "www.ayahclip.com")
      && (url.pathname === "/import"
        || url.pathname === "/studio"
        || url.pathname.startsWith("/studio/"));
  } catch {
    return false;
  }
}

export function parseMobileBridgeEnvelope(value: unknown): MobileBridgeEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.protocolVersion !== MOBILE_BRIDGE_PROTOCOL_VERSION) return null;
  if (typeof candidate.id !== "string" || candidate.id.length < 1 || candidate.id.length > 128) {
    return null;
  }
  if (typeof candidate.type !== "string"
    || !MOBILE_BRIDGE_MESSAGE_TYPES.includes(candidate.type as MobileBridgeMessageType)) {
    return null;
  }
  if (!candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)) {
    return null;
  }
  return candidate as unknown as MobileBridgeEnvelope;
}

export function isMobileProjectSnapshotV1(value: unknown): value is MobileProjectSnapshotV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const project = value as Partial<MobileProjectSnapshotV1>;
  if (project.schemaVersion !== 1
    || typeof project.id !== "string"
    || !isUuid(project.id)
    || typeof project.title !== "string"
    || project.title.trim().length === 0
    || project.title.length > 200
    || !Array.isArray(project.segments)
    || !project.style
    || !Array.isArray(project.media)
    || typeof project.createdAtMilliseconds !== "number"
    || typeof project.updatedAtMilliseconds !== "number") return false;

  if (project.editorDocumentJSON != null
    && !isValidMobileEditorDocument(project.editorDocumentJSON, project.id)) return false;

  const segments = project.segments;
  let previousEnd = 0;
  for (const segment of segments) {
    if (!segment
      || typeof segment.id !== "string"
      || !isUuid(segment.id)
      || !Number.isInteger(segment.verseNumber)
      || segment.verseNumber < 1
      || !Number.isFinite(segment.start)
      || !Number.isFinite(segment.end)
      || segment.start < previousEnd
      || segment.end <= segment.start
      || typeof segment.arabic !== "string"
      || typeof segment.translation !== "string") return false;
    previousEnd = segment.end;
  }
  if (project.quran !== null) {
    if (!project.quran
      || !Number.isInteger(project.quran.surahId)
      || project.quran.surahId < 1
      || project.quran.surahId > 114
      || !Array.isArray(project.quran.verseNumbers)
      || project.quran.verseNumbers.length === 0) return false;
    const numbers = project.quran.verseNumbers;
    if (numbers.some((number) => !Number.isInteger(number) || number < 1)
      || numbers.some((number, index) => index > 0 && number <= numbers[index - 1])) return false;
    if (numbers.length !== segments.length
      || numbers.some((number, index) => number !== segments[index]?.verseNumber)) return false;
  }
  const layouts = ["centered", "sideFade", "lowerThird"];
  const captionStyles = ["softGlow", "crispOutline", "gold", "clean"];
  if (!layouts.includes(project.style.layout)
    || !captionStyles.includes(project.style.captionStyle)
    || !Number.isFinite(project.style.arabicSize)
    || project.style.arabicSize <= 0
    || !Number.isFinite(project.style.translationSize)
    || project.style.translationSize <= 0
    || !Number.isFinite(project.style.overlayOpacity)
    || project.style.overlayOpacity < 0
    || project.style.overlayOpacity > 1) return false;
  const mediaIds = new Set<string>();
  return project.media.every((item) => {
    if (!item
      || typeof item.id !== "string"
      || item.id.length < 1
      || item.id.length > 128
      || mediaIds.has(item.id)
      || typeof item.url !== "string"
      || item.url !== `ayahclip-media://asset/${item.id}`
      || typeof item.contentType !== "string"
      || item.contentType.length === 0
      || !Number.isSafeInteger(item.fileSize)
      || item.fileSize < 0) return false;
    mediaIds.add(item.id);
    return true;
  });
}

export const MOBILE_EDITOR_DOCUMENT_MAX_BYTES = 1_048_576;

export function createMobileEditorDocument(
  projectId: string,
  project: Record<string, unknown>,
  media: MobileProjectSnapshotV1["media"] = [],
): string {
  const durableProject = replaceValues(project, (value) => {
    const index = media.findIndex((item) => item.url === value);
    return index >= 0 ? `ayahclip-native-ref://media/${index}` : value;
  });
  const json = JSON.stringify({ schemaVersion: 1, projectId, project: durableProject });
  if (!isValidMobileEditorDocument(json, projectId)) {
    throw new Error("AyahClip could not create a durable mobile editor document.");
  }
  return json;
}

export function readMobileEditorDocument(
  json: string,
  projectId: string,
  media: MobileProjectSnapshotV1["media"],
): Record<string, unknown> {
  if (!isValidMobileEditorDocument(json, projectId)) {
    throw new Error("AyahClip could not read that mobile editor document.");
  }
  const document = JSON.parse(json) as { project: Record<string, unknown> };
  return replaceValues(document.project, (value) => {
    if (!value.startsWith("ayahclip-native-ref://media/")) return value;
    const match = /^ayahclip-native-ref:\/\/media\/(\d+)$/.exec(value);
    const index = match ? Number(match[1]) : -1;
    if (!Number.isSafeInteger(index) || index < 0 || index >= media.length) {
      throw new Error("AyahClip could not resolve saved native media.");
    }
    return media[index].url;
  }) as Record<string, unknown>;
}

export function isValidMobileEditorDocument(json: string, projectId: string): boolean {
  if (new TextEncoder().encode(json).byteLength > MOBILE_EDITOR_DOCUMENT_MAX_BYTES) return false;
  try {
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const document = value as Record<string, unknown>;
    if (document.schemaVersion !== 1
      || document.projectId !== projectId
      || !document.project
      || typeof document.project !== "object"
      || Array.isArray(document.project)) return false;
    return !containsEphemeralOrUnsafeURL(document);
  } catch {
    return false;
  }
}

function containsEphemeralOrUnsafeURL(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower.startsWith("file:")
      || lower.startsWith("blob:")
      || lower.startsWith("ayahclip-media:")
      || lower.startsWith("javascript:")
      || lower.startsWith("data:text/html");
  }
  if (Array.isArray(value)) return value.some(containsEphemeralOrUnsafeURL);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(containsEphemeralOrUnsafeURL);
  }
  return false;
}

function replaceValues(value: unknown, transform: (value: string) => string): unknown {
  if (typeof value === "string") return transform(value);
  if (Array.isArray(value)) return value.map((item) => replaceValues(item, transform));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, replaceValues(item, transform)]),
    );
  }
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
