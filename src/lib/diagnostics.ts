export interface DiagnosticsInput {
  userAgent: string;
  language: string;
  viewport: { width: number; height: number; pixelRatio: number };
  capabilities: {
    webAudio: boolean;
    webCodecs: boolean;
    offscreenCanvas: boolean;
    indexedDb: boolean;
  };
  editor: {
    audioMode: "reciter" | "imported";
    videoFormat: string;
    backgroundType: string;
    selectedVerseCount: number;
    timingCount: number;
    backgroundSceneCount: number;
    backgroundSequenceEnabled: boolean;
  };
}

export interface AyahClipDiagnostics {
  schema: 1;
  app: "AyahClip";
  generatedAt: string;
  environment: {
    browser: string;
    platform: string;
    language: string;
    viewport: string;
    pixelRatio: number;
  };
  capabilities: DiagnosticsInput["capabilities"];
  editor: DiagnosticsInput["editor"];
}

export function classifyBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/CriOS\//.test(userAgent)) return "Chrome iOS";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Other";
}

export function classifyPlatform(userAgent: string): string {
  if (/iPad|iPhone|iPod/.test(userAgent)) return "iOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "macOS";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Linux/.test(userAgent)) return "Linux";
  return "Other";
}

/**
 * Build a deliberately small, allow-listed report. Raw user agent strings,
 * file names, media URLs, Quran text, translations, and project names are not
 * copied into the result.
 */
export function buildDiagnostics(
  input: DiagnosticsInput,
  generatedAt = new Date().toISOString(),
): AyahClipDiagnostics {
  return {
    schema: 1,
    app: "AyahClip",
    generatedAt,
    environment: {
      browser: classifyBrowser(input.userAgent),
      platform: classifyPlatform(input.userAgent),
      language: input.language,
      viewport: `${input.viewport.width}x${input.viewport.height}`,
      pixelRatio: input.viewport.pixelRatio,
    },
    capabilities: {
      webAudio: input.capabilities.webAudio,
      webCodecs: input.capabilities.webCodecs,
      offscreenCanvas: input.capabilities.offscreenCanvas,
      indexedDb: input.capabilities.indexedDb,
    },
    editor: {
      audioMode: input.editor.audioMode,
      videoFormat: input.editor.videoFormat,
      backgroundType: input.editor.backgroundType,
      selectedVerseCount: input.editor.selectedVerseCount,
      timingCount: input.editor.timingCount,
      backgroundSceneCount: input.editor.backgroundSceneCount,
      backgroundSequenceEnabled: input.editor.backgroundSequenceEnabled,
    },
  };
}
