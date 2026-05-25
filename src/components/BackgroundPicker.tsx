"use client";

import { useState } from "react";
import { Background } from "@/types";
import { backgroundPresets } from "@/lib/backgrounds";
import { PexelsSearch } from "./PexelsSearch";

interface BackgroundPickerProps {
  value: Background;
  onChange: (bg: Background) => void;
}

type Tab = "presets" | "pexels" | "upload";

export function BackgroundPicker({ value, onChange }: BackgroundPickerProps) {
  const [tab, setTab] = useState<Tab>("presets");

  const tabs: { id: Tab; label: string }[] = [
    { id: "presets", label: "Presets" },
    { id: "pexels", label: "Stock Photos" },
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
      {tab === "pexels" && <PexelsSearch onSelect={onChange} />}
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

function UploadSection({
  onChange,
}: {
  onChange: (bg: Background) => void;
}) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange({ type: "image", value: url, label: file.name });
  };

  return (
    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-6 transition-colors hover:border-white/20">
      <span className="text-2xl text-gray-500">+</span>
      <span className="text-xs text-gray-400">Click to upload image</span>
      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </label>
  );
}
