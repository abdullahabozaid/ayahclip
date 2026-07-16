"use client";

import { useState } from "react";
import { buildDiagnostics } from "@/lib/diagnostics";
import { useAppStore } from "@/lib/store";

type CopyState = "idle" | "copying" | "copied" | "failed";

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Clipboard timed out")), 1200);
        }),
      ]);
      return;
    } catch {
      // Sandboxed browsers can expose Clipboard API but leave the permission
      // request pending. Fall through to the synchronous local-page fallback.
    }
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy was not available");
}

function createReport(): string {
  const state = useAppStore.getState();
  const timingCount = state.audioSource.mode === "imported"
    ? state.audioSource.timings.length
    : 0;

  return JSON.stringify(
    buildDiagnostics({
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
      },
      capabilities: {
        webAudio: "AudioContext" in window || "webkitAudioContext" in window,
        webCodecs: "VideoEncoder" in window && "AudioEncoder" in window,
        offscreenCanvas: "OffscreenCanvas" in window,
        indexedDb: "indexedDB" in window,
      },
      editor: {
        audioMode: state.audioSource.mode,
        videoFormat: state.videoFormat,
        backgroundType: state.background.type,
        selectedVerseCount: state.selectedVerseNumbers.length,
        timingCount,
        backgroundSceneCount: state.backgroundScenes.length,
        backgroundSequenceEnabled: state.backgroundSequenceEnabled,
      },
    }),
    null,
    2,
  );
}

export function DiagnosticsPanel() {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [report, setReport] = useState("");

  const copyDiagnostics = async () => {
    setCopyState("copying");
    const nextReport = createReport();
    setReport(nextReport);
    try {
      await copyText(nextReport);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="rounded-[1.5rem] border border-[var(--hairline)] bg-[rgba(20,31,27,0.72)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-7">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[rgba(201,162,75,0.08)] text-gold" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l2.5 1.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div>
          <h2 className="font-display text-xl text-parchment">Copy diagnostics</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            If an import or export fails, include this report when asking for help. It contains browser capabilities and editor counts only.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--hairline-soft)] bg-[rgba(5,11,9,0.32)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
        Never included: file names, audio or video links, project names, Quran text, translations, or your saved media.
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copyDiagnostics} disabled={copyState === "copying"} className="btn-gold min-h-11 rounded-full px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-70">
          {copyState === "copying" && "Copying…"}
          {copyState === "copied" && "Diagnostics copied"}
          {(copyState === "idle" || copyState === "failed") && "Copy diagnostics"}
        </button>
        <p role="status" aria-live="polite" className={`text-xs ${copyState === "failed" ? "text-red-300" : "text-[var(--muted)]"}`}>
          {copyState === "copied" && "Ready to paste into a support message."}
          {copyState === "failed" && "Automatic copy was blocked. Select the report below and copy it manually."}
        </p>
      </div>

      {copyState === "failed" && (
        <textarea
          aria-label="Diagnostics report"
          readOnly
          value={report}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-4 min-h-48 w-full resize-y rounded-xl border border-[var(--hairline)] bg-[rgba(5,11,9,0.5)] p-3 font-mono text-[11px] leading-relaxed text-[var(--muted)] outline-none focus:border-[var(--gold)]"
        />
      )}
    </section>
  );
}
