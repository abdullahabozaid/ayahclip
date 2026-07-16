"use client";

import type { CSSProperties } from "react";
import type { QcfWord } from "@/types";
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
}: {
  font: string;
  weight: number;
  qcfWords?: QcfWord[];
  fallback: string;
  className?: string;
}) {
  if (font === "qcf") {
    return (
      <QcfVerse
        qcfWords={qcfWords}
        fallback={fallback}
        className={className}
      />
    );
  }

  const style: CSSProperties = {
    fontFamily: SPECIMEN_FAMILIES[font] ?? '"UthmanicHafs", serif',
    fontWeight: weight,
  };
  return (
    <p dir="rtl" lang="ar" className={className} style={style}>
      {fallback}
    </p>
  );
}
