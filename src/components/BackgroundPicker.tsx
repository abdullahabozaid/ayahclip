"use client";

import { useState } from "react";
import { Background } from "@/types";
import { backgroundPresets } from "@/lib/backgrounds";
import { VIDEO_PRESETS, VIDEO_CATEGORIES } from "@/lib/video-presets";
import { StockLibrary } from "./StockLibrary";

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
      <div className="flex gap-1 rounded-lg border border-white/10 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "presets" && <PresetsGrid value={value} onChange={onChange} />}
      {tab === "pexels" && <StockLibrary onSelect={onChange} />}
      {tab === "video" && <VideoSection value={value} onChange={onChange} />}
      {tab === "upload" && <UploadSection onChange={onChange} />}
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
        <p className="mb-2 text-xs text-gray-400">Solid Colors</p>
        <div className="flex flex-wrap gap-2">
          {solids.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-gray-400">Gradients</p>
        <div className="flex flex-wrap gap-2">
          {gradients.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ background: bg.value }}
              aria-label={bg.label}
              title={bg.label}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-gray-400">Images</p>
        <div className="flex flex-wrap gap-2">
          {images.map((bg) => (
            <button
              key={bg.value}
              onClick={() => onChange(bg)}
              className={`h-8 w-8 rounded-md border-2 transition-all overflow-hidden ${
                value.value === bg.value
                  ? "border-emerald-500 scale-110"
                  : "border-transparent hover:border-white/30"
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
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("Video must be under 50MB");
      return;
    }
    const url = URL.createObjectURL(file);
    onChange({ type: "video", value: url, label: file.name });
  };

  return (
    <div className="space-y-3">
      {VIDEO_CATEGORIES.map((category) => {
        const presets = VIDEO_PRESETS.filter((p) => p.category === category);
        if (presets.length === 0) return null;
        return (
          <div key={category}>
            <p className="mb-2 text-xs capitalize text-gray-400">{category}</p>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    onChange({
                      type: "video",
                      value: preset.videoUrl,
                      label: preset.name,
                    })
                  }
                  className={`overflow-hidden rounded-md border-2 transition-all ${
                    value.value === preset.videoUrl
                      ? "border-emerald-500 scale-105"
                      : "border-transparent hover:border-white/30"
                  }`}
                >
                  <div className="aspect-video bg-white/5">
                    <img
                      src={preset.thumbnailUrl}
                      alt={preset.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <p className="truncate px-1 py-0.5 text-[10px] text-gray-400">
                    {preset.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-4 transition-colors hover:border-white/20">
        <span className="text-lg text-gray-500">+</span>
        <span className="text-xs text-gray-400">
          Upload video (MP4/WebM, max 50MB)
        </span>
        <input
          type="file"
          accept="video/mp4,video/webm"
          onChange={handleVideoUpload}
          className="hidden"
        />
      </label>
    </div>
  );
}

function UploadSection({
  onChange,
}: {
  onChange: (bg: Background) => void;
}) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    onChange({
      type: isVideo ? "video" : "image",
      value: url,
      label: file.name,
    });
  };

  return (
    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-6 transition-colors hover:border-white/20">
      <span className="text-2xl text-gray-500">+</span>
      <span className="text-xs text-gray-400">Click to upload image or video</span>
      <input
        type="file"
        accept="image/*,video/mp4,video/webm"
        onChange={handleFile}
        className="hidden"
      />
    </label>
  );
}
