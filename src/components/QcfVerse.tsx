"use client";

import { useEffect, useState } from "react";
import type { QcfWord } from "@/types";
import { qcfFontFamily, ensureQcfFontsReady } from "@/lib/qcf-font-loader";
import { sanitizeArabic } from "@/lib/canvas-utils";

interface QcfVerseProps {
  qcfWords?: QcfWord[];
  fallback: string;
  className?: string;
}

export function QcfVerse({ qcfWords, fallback, className = "" }: QcfVerseProps) {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    if (!qcfWords || qcfWords.length === 0) return;
    let cancelled = false;
    ensureQcfFontsReady(qcfWords).then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => { cancelled = true; };
  }, [qcfWords]);

  if (!qcfWords || qcfWords.length === 0 || !fontsReady) {
    return (
      <p dir="rtl" className={`font-arabic text-[22px] leading-loose ${className}`}>
        {sanitizeArabic(fallback)}
      </p>
    );
  }

  return (
    <p dir="rtl" className={`text-[22px] leading-loose ${className}`}>
      {qcfWords.map((w, i) => (
        <span key={i} style={{ fontFamily: qcfFontFamily(w.page_number) }}>
          {w.code_v2}
        </span>
      ))}
    </p>
  );
}
