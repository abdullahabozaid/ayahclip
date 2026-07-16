"use client";

import { useEffect, useRef } from "react";
import { fetchVerses } from "@/lib/api";
import { ensureFontsReady } from "@/lib/canvas-utils";
import { drawScene, FORMAT_SIZES, type SceneStyleSource } from "@/lib/render-core";
import { ensureQcfFontsReady } from "@/lib/qcf-font-loader";
import type { StyleSettings } from "@/lib/style";
import type { TemplateExtras } from "@/lib/template-model";
import type { QcfWord } from "@/types";

export interface SampleVerse {
  label: string;
  arabicText: string;
  translation?: string;
  verseNumber: number;
  qcfWords?: QcfWord[];
}

export const FALLBACK_SAMPLE: SampleVerse = {
  label: "Short",
  arabicText: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
  translation: "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
  verseNumber: 1,
};

const SAMPLE_SOURCES = [
  { label: "Short", surah: 1, verse: 1 },
  { label: "Medium", surah: 1, verse: 7 },
  { label: "Long", surah: 59, verse: 23 },
] as const;

let samplesPromise: Promise<SampleVerse[]> | null = null;
export function loadTemplateSamples(): Promise<SampleVerse[]> {
  if (!samplesPromise) {
    samplesPromise = Promise.all(
      SAMPLE_SOURCES.map(async (source) => {
        const verses = await fetchVerses(source.surah);
        const verse = verses.find((item) => item.verse_number === source.verse);
        if (!verse) throw new Error(`Template sample ${source.surah}:${source.verse} missing`);
        return {
          label: source.label,
          arabicText: verse.text_uthmani,
          translation: verse.translation,
          verseNumber: verse.verse_number,
          qcfWords: verse.qcfWords,
        };
      })
    ).catch((error) => {
      console.warn("Could not load template samples", error);
      samplesPromise = null;
      return [FALLBACK_SAMPLE];
    });
  }
  return samplesPromise;
}

function toScene(style: StyleSettings, extras: TemplateExtras): SceneStyleSource {
  return {
    ...style,
    arabicVerseNumber: style.arabicVerseNumber ?? false,
    translationVerseNumber: style.translationVerseNumber ?? false,
    lineHeight: style.lineHeight ?? 1,
    translationLineHeight: style.translationLineHeight ?? 1,
    arabicTranslationGap: style.arabicTranslationGap ?? 0.6,
    videoFormat: "9:16",
    safeAreaTarget: extras.safeAreaTarget ?? "none",
    safePadding: extras.safePadding ?? 0,
    emphasisStyle: "color",
    emphasisColor: "#c9a24b",
  };
}

export function TemplatePreview({
  style,
  extras = {},
  sample = FALLBACK_SAMPLE,
  replayToken = 0,
  className = "block h-full w-full",
}: {
  style: StyleSettings;
  extras?: TemplateExtras;
  sample?: SampleVerse;
  replayToken?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    const drawAt = (introProgress: number) => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const size = FORMAT_SIZES["9:16"];
      if (canvas.width !== size.w) canvas.width = size.w;
      if (canvas.height !== size.h) canvas.height = size.h;
      const context = canvas.getContext("2d");
      if (!context) return;
      drawScene(context, toScene(style, extras), {
        arabicText: sample.arabicText,
        verseNumber: sample.verseNumber,
        translation: style.translationEnabled ? sample.translation : undefined,
        isLastPart: true,
        introProgress,
        qcfWords: sample.qcfWords,
      });
    };
    const start = () => {
      if ((style.verseIntro ?? "none") === "none") {
        drawAt(1);
        return;
      }
      const duration = style.verseIntroMs ?? 450;
      const startedAt = performance.now();
      const tick = () => {
        if (cancelled) return;
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        drawAt(progress);
        if (progress < 1) animationFrame = requestAnimationFrame(tick);
      };
      animationFrame = requestAnimationFrame(tick);
    };
    Promise.all([
      ensureFontsReady(
        style.arabicFont,
        style.translationFont,
        style.arabicFontWeight,
        style.translationFontWeight,
      ),
      style.arabicFont === "qcf" && sample.qcfWords?.length
        ? ensureQcfFontsReady(sample.qcfWords)
        : Promise.resolve(),
    ]).then(() => {
      if (!cancelled) start();
    });
    // Keep a useful preview visible while fonts load. Once they are ready the
    // entrance animation replays with the intended typefaces.
    drawAt(1);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [extras, replayToken, sample, style]);

  return <canvas ref={canvasRef} className={className} aria-label="Template preview" />;
}
