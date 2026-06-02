"use client";

import { useRef, useState } from "react";
import { Background } from "@/types";
import { backgroundPresets } from "@/lib/backgrounds";
import { VIDEO_PRESETS, VIDEO_CATEGORIES } from "@/lib/video-presets";
import { AESTHETIC_VIDEOS } from "@/lib/aesthetic-videos";
import { StockLibrary } from "./StockLibrary";

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
}

type Tab = "presets" | "pexels" | "video" | "upload";

export function BackgroundPicker({ value, onChange }: BackgroundPickerProps) {
  const [tab, setTab] = useState<Tab>("presets");

  const tabs: { id: Tab; label: string }[] = [
    { id: "presets", label: "Presets" },
    { id: "pexels", label: "Stock Photos" },
    { id: "video", label: "Video" },
    { id: "upload", label: "Upload" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "text-[var(--muted)] hover:text-parchment"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "presets" && <PresetsGrid value={value} onChange={onChange} />}
      {tab === "pexels" && <StockLibrary onSelect={onChange} />}
      {tab === "video" && <VideoSection value={value} onChange={onChange} />}
      {tab === "upload" && <UploadSection value={value} onChange={onChange} />}
    </div>
  );
}

function PresetsGrid({
  value,
  onChange,
}: {
  value: Background;
  onChange: (bg: Background) => void;
}) {
  const solids = backgroundPresets.filter((b) => b.type === "solid");
  const gradients = backgroundPresets.filter((b) => b.type === "gradient");
  const images = backgroundPresets.filter((b) => b.type === "image");

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">Solid Colors</p>
        <div className="flex flex-wrap gap-2">
          {solids.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all ${
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
              className={`h-8 w-8 rounded-md border-2 transition-all ${
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
        <p className="mb-2 text-xs text-[var(--muted)]">Images</p>
        <div className="flex flex-wrap gap-2">
          {images.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all overflow-hidden ${
                value.value === bg.value
                  ? "border-[var(--gold)] scale-110"
                  : "border-transparent hover:border-[var(--hairline)]"
              }`}
              aria-label={bg.label}
              title={bg.label}
            >
              <img
                src={bg.value}
                alt={bg.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function VideoSection({
  value,
  onChange,
}: {
  value: Background;
  onChange: (bg: Background) => void;
}) {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("Video must be under 50MB");
      return;
    }
    revokeIfBlob(value.value);
    const url = URL.createObjectURL(file);
    onChange({ type: "video", value: url, label: file.name });
  };
  const openVideoPicker = () => {
    const el = videoInputRef.current;
    if (!el) return;
    el.value = "";
    el.click();
  };

  return (
    <div className="space-y-3">
      {/* Your videos (local, synced from the aesthetic folder) */}
      {AESTHETIC_VIDEOS.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-gold-soft/80">Your videos</p>
          <div className="grid grid-cols-3 gap-2">
            {AESTHETIC_VIDEOS.map((v) => (
              <VideoThumb
                key={v.id}
                videoUrl={v.file}
                name={v.name}
                fallbackDuration={v.duration}
                selected={value.value === v.file}
                onSelect={() => onChange({ type: "video", value: v.file, label: v.name })}
              />
            ))}
          </div>
        </div>
      )}

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

      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm"
        onChange={handleVideoUpload}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={openVideoPicker}
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-4 transition-colors hover:border-white/20 focus-visible:border-gold"
      >
        <span className="text-lg text-[var(--muted-deep)]">+</span>
        <span className="text-xs text-[var(--muted)]">Upload video (MP4/WebM, max 50MB)</span>
      </button>
    </div>
  );
}

function UploadSection({
  value,
  onChange,
}: {
  value: Background;
  onChange: (bg: Background) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    revokeIfBlob(value.value);
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    onChange({
      type: isVideo ? "video" : "image",
      value: url,
      label: file.name,
    });
  };
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    el.value = "";
    el.click();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/webm"
        onChange={handleFile}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={openPicker}
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-6 transition-colors hover:border-white/20 focus-visible:border-gold"
      >
        <span className="text-2xl text-[var(--muted-deep)]">+</span>
        <span className="text-xs text-[var(--muted)]">Click to upload image or video</span>
      </button>
    </>
  );
}
