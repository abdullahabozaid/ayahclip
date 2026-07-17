"use client";

import { useEffect, useState } from "react";
import type { QcfWord } from "@/types";
import { qcfFontFamily, ensureQcfFontsReady } from "@/lib/qcf-font-loader";
import { arabicTextForFont } from "@/lib/canvas-utils";

interface QcfVerseProps {
  qcfWords?: QcfWord[];
  fallback: string;
  className?: string;
  inkThickness?: number;
}

export function QcfVerse({ qcfWords, fallback, className = "", inkThickness = 0 }: QcfVerseProps) {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    if (!qcfWords || qcfWords.length === 0) return;
    let cancelled = false;
    ensureQcfFontsReady(qcfWords)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        // Keep the readable Uthmanic fallback. The loader clears its failed
        // request so a later render can retry the page font.
        if (!cancelled) setFontsReady(false);
      });
    return () => { cancelled = true; };
  }, [qcfWords]);

  if (!qcfWords || qcfWords.length === 0 || !fontsReady) {
    return (
      <p
        dir="rtl"
        className={`font-arabic text-[22px] leading-loose ${className}`}
        style={inkThickness > 0 ? { WebkitTextStroke: `${inkThickness}px currentColor`, paintOrder: "stroke fill" } : undefined}
      >
        {arabicTextForFont(fallback, "uthmanic-hafs")}
      </p>
    );
  }

  return (
    <p
      dir="rtl"
      className={`text-[22px] leading-loose ${className}`}
      style={inkThickness > 0 ? { WebkitTextStroke: `${inkThickness}px currentColor`, paintOrder: "stroke fill" } : undefined}
    >
      {qcfWords.map((w, i) => (
        <span key={i} style={{ fontFamily: qcfFontFamily(w.page_number) }}>
          {w.code_v2}
        </span>
      ))}
    </p>
  );
}
