"use client";

import type { CSSProperties } from "react";
import type { QcfWord } from "@/types";
import { arabicTextForFont, supportedArabicFontWeight } from "@/lib/canvas-utils";
import { QcfVerse } from "./QcfVerse";

const SPECIMEN_FAMILIES: Record<string, string> = {
  "uthmanic-hafs": '"UthmanicHafs", serif',
  "amiri-quran": 'var(--font-amiri-quran), "UthmanicHafs", serif',
  "scheherazade-new": 'var(--font-scheherazade), "UthmanicHafs", serif',
  "noto-naskh-arabic": 'var(--font-noto-naskh), "UthmanicHafs", serif',
};

export function ArabicFontSpecimen({
  font,
  weight,
  qcfWords,
  fallback,
  className = "",
  inkThickness = 0,
}: {
  font: string;
  weight: number;
  qcfWords?: QcfWord[];
  fallback: string;
  className?: string;
  inkThickness?: number;
}) {
  if (font === "qcf") {
    return (
      <QcfVerse
        qcfWords={qcfWords}
        fallback={fallback}
        className={className}
        inkThickness={inkThickness}
      />
    );
  }

  const style: CSSProperties = {
    fontFamily: SPECIMEN_FAMILIES[font] ?? '"UthmanicHafs", serif',
    // Match canvas/export exactly and never synthesize a heavy Quran face from
    // stale saved settings.
    fontWeight: supportedArabicFontWeight(font, weight),
    ...(inkThickness > 0
      ? { WebkitTextStroke: `${inkThickness}px currentColor`, paintOrder: "stroke fill" }
      : {}),
  };
  return (
    <p dir="rtl" lang="ar" className={className} style={style}>
      {arabicTextForFont(fallback, font, qcfWords)}
    </p>
  );
}
