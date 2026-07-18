"use client";

import { useRef, useState } from "react";
import { Background } from "@/types";
import { backgroundPresets } from "@/lib/backgrounds";
import { VIDEO_PRESETS, VIDEO_CATEGORIES } from "@/lib/video-presets";
import { StockLibrary } from "./StockLibrary";
import { BackgroundEditor } from "./BackgroundEditor";
import { BrollLibrary } from "./BrollLibrary";
import { isSupportedVideoFile, VIDEO_FILE_ACCEPT } from "@/lib/media-file";
import {
  nativeMobileBridgeAvailable,
  requestNativeMediaImport,
} from "@/lib/mobile-bridge";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Free a previously-uploaded background's object URL when it's being replaced,
// so repeated uploads in one session don't leak blobs.
function revokeIfBlob(url: string | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

/** Video preset tile: first-frame preview + duration badge (bottom-right). */
function VideoThumb({
  videoUrl,
  posterUrl,
  name,
  selected,
  fallbackDuration,
  onSelect,
}: {
  videoUrl: string;
  posterUrl?: string | null;
  name: string;
  selected: boolean;
  fallbackDuration?: number | null;
  onSelect: () => void;
}) {
  const [duration, setDuration] = useState<number | null>(fallbackDuration ?? null);

  return (
    <button
      onClick={onSelect}
      className={`overflow-hidden rounded-md border-2 transition-all ${
        selected
          ? "border-[var(--gold)] scale-105"
          : "border-transparent hover:border-[var(--hairline)]"
      }`}
    >
      <div className="relative aspect-video bg-white/5">
        <video
          src={videoUrl}
          poster={posterUrl ?? undefined}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
        />
        {duration != null && (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[9px] font-medium tabular-nums text-white">
            {fmtDuration(duration)}
          </span>
        )}
      </div>
      <p className="truncate px-1 py-0.5 text-[10px] text-[var(--muted)]">{name}</p>
    </button>
  );
}

interface BackgroundPickerProps {
  value: Background;
  onChange: (bg: Background) => void;
  /** Edit the current solid/gradient without treating each input event as a new B-roll item. */
  onEditCurrent?: (bg: Background) => void;
  /** False when uploads are appended to a B-roll sequence instead of replacing media. */
  revokePrevious?: boolean;
}

type Tab = "presets" | "pexels" | "video" | "library";

export function BackgroundPicker({
  value,
  onChange,
  onEditCurrent = onChange,
  revokePrevious = true,
}: BackgroundPickerProps) {
  const [tab, setTab] = useState<Tab>("presets");

  const tabs: { id: Tab; label: string }[] = [
    { id: "presets", label: "Presets" },
    { id: "pexels", label: "Stock Photos" },
    { id: "video", label: "Video" },
    { id: "library", label: "My media" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-10 flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "text-[var(--muted)] hover:text-parchment"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "presets" && (
        <PresetsGrid value={value} onChange={onChange} onEditCurrent={onEditCurrent} />
      )}
      {tab === "pexels" && <StockLibrary onSelect={onChange} />}
      {tab === "video" && <VideoSection value={value} onChange={onChange} revokePrevious={revokePrevious} />}
      {tab === "library" && <BrollLibrary value={value} onSelect={onChange} />}
    </div>
  );
}

function PresetsGrid({
  value,
  onChange,
  onEditCurrent,
}: {
  value: Background;
  onChange: (bg: Background) => void;
  onEditCurrent: (bg: Background) => void;
}) {
  const solids = backgroundPresets.filter((b) => b.type === "solid");
  const gradients = backgroundPresets.filter((b) => b.type === "gradient");
  const graphicImages = backgroundPresets.filter(
    (background) => background.type === "image" && background.collection !== "artistic",
  );
  const artisticImages = backgroundPresets.filter(
    (background) => background.type === "image" && background.collection === "artistic",
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">Solid Colors</p>
        <div className="flex flex-wrap gap-2">
          {solids.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-10 w-10 rounded-lg border-2 transition-all ${
                value.value === bg.value
                  ? "border-[var(--gold)] scale-110"
                  : "border-transparent hover:border-[var(--hairline)]"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">Gradients</p>
        <div className="flex flex-wrap gap-2">
          {gradients.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-10 w-10 rounded-lg border-2 transition-all ${
                value.value === bg.value
                  ? "border-[var(--gold)] scale-110"
                  : "border-transparent hover:border-[var(--hairline)]"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
      <BackgroundEditor value={value} onChange={onEditCurrent} />
      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">Graphic backgrounds</p>
        <div className="flex flex-wrap gap-2">
          {graphicImages.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-10 w-10 overflow-hidden rounded-lg border-2 transition-all ${
                value.value === bg.value
                  ? "border-[var(--gold)] scale-110"
                  : "border-transparent hover:border-[var(--hairline)]"
              }`}
              aria-label={bg.label}
              aria-pressed={value.value === bg.value}
              title={bg.label}
            >
              {/* Direct media preview: sources may be blob URLs or user-selected remote files. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bg.value}
                alt={bg.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--muted)]">Artistic illustrations</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--muted-deep)]">
              Original vertical compositions with room for captions.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--hairline-soft)] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
            Original
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {artisticImages.map((background) => {
            const selected = value.value === background.value;

            return (
              <button
                key={background.value}
                type="button"
                onClick={() => onChange(background)}
                aria-label={`Use ${background.label}`}
                aria-pressed={selected}
                className={`group min-w-0 overflow-hidden rounded-lg border text-left transition-colors ${
                  selected
                    ? "border-[var(--gold)] bg-[var(--gold)]/5"
                    : "border-[var(--hairline-soft)] bg-white/[0.025] hover:border-[var(--hairline)]"
                }`}
              >
                <span className="relative block aspect-[9/16] overflow-hidden bg-[var(--ink-deep)]">
                  {/* Built-in artwork is served from the local public directory. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={background.value}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--gold)] text-[10px] font-bold text-[var(--ink-deep)] shadow-sm">
                      ✓
                    </span>
                  )}
                </span>
                <span className="block truncate px-2 py-1.5 text-[10px] text-[var(--muted)]">
                  {background.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VideoSection({
  value,
  onChange,
  revokePrevious,
}: {
  value: Background;
  onChange: (bg: Background) => void;
  revokePrevious: boolean;
}) {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSupportedVideoFile(file)) {
      setUploadError("Choose an MP4, WebM, MOV, or M4V video.");
      e.target.value = "";
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("Choose a video under 50 MB.");
      e.target.value = "";
      return;
    }
    setUploadError(null);
    if (revokePrevious) revokeIfBlob(value.value);
    const url = URL.createObjectURL(file);
    onChange({ type: "video", value: url, label: file.name });
  };
  const openVideoPicker = async () => {
    if (nativeMobileBridgeAvailable()) {
      setUploadError(null);
      try {
        const result = await requestNativeMediaImport({
          kinds: ["video"],
          maxCount: 1,
          purpose: revokePrevious ? "replacement" : "broll",
        });
        const media = result?.media[0];
        if (!media || !media.contentType.startsWith("video/")) {
          throw new Error("No video was selected.");
        }
        if (revokePrevious) revokeIfBlob(value.value);
        onChange({ type: "video", value: media.url, label: "iPhone video" });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "That video could not be imported.");
      }
      return;
    }
    const el = videoInputRef.current;
    if (!el) return;
    el.value = "";
    el.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          People-free motion backgrounds, reviewed by AyahClip.
        </p>
        <span className="shrink-0 rounded-full border border-[var(--hairline-soft)] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
          Curated
        </span>
      </div>
      {VIDEO_CATEGORIES.map((category) => {
        const presets = VIDEO_PRESETS.filter((p) => p.category === category);
        if (presets.length === 0) return null;
        return (
          <div key={category}>
            <p className="mb-2 text-xs capitalize text-[var(--muted)]">{category}</p>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <VideoThumb
                  key={preset.id}
                  videoUrl={preset.videoUrl}
                  posterUrl={preset.thumbnailUrl}
                  name={preset.name}
                  selected={value.value === preset.videoUrl}
                  onSelect={() =>
                    onChange({ type: "video", value: preset.videoUrl, label: preset.name })
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      <a
        href="https://www.pexels.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto block w-fit text-[10px] text-[var(--muted)] underline-offset-4 transition-colors hover:text-parchment hover:underline"
      >
        Videos provided by Pexels
      </a>

      <input
        ref={videoInputRef}
        type="file"
        accept={VIDEO_FILE_ACCEPT}
        onChange={handleVideoUpload}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => void openVideoPicker()}
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-4 transition-colors hover:border-white/20 focus-visible:border-gold"
      >
        <span className="text-lg text-[var(--muted-deep)]">+</span>
        <span className="text-xs text-[var(--muted)]">Upload video (MP4, WebM, MOV or M4V · max 50MB)</span>
      </button>
      {uploadError && <p className="text-xs text-red-400" role="alert">{uploadError}</p>}
    </div>
  );
}
