"use client";

import { useState } from "react";
import { getReciter } from "@/lib/reciters";
import { useAppStore } from "@/lib/store";
import type {
  CaptionTone,
  SocialCaptionOption,
  SocialPlatform,
} from "@/lib/social-caption";

interface CaptionResponse {
  source: "openai" | "editorial";
  options: SocialCaptionOption[];
  notice: string;
}

const PLATFORMS: Array<{ id: SocialPlatform; label: string }> = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Reels" },
  { id: "youtube", label: "Shorts" },
];

const TONES: Array<{ id: CaptionTone; label: string; note: string }> = [
  { id: "simple", label: "Simple", note: "Short, direct, restrained" },
  { id: "reflective", label: "Reflective", note: "A little more context, no tafsir" },
];

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function isCaptionResponse(value: unknown): value is CaptionResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return (response.source === "openai" || response.source === "editorial")
    && typeof response.notice === "string"
    && Array.isArray(response.options)
    && response.options.every((option) => {
      if (!option || typeof option !== "object") return false;
      const item = option as Record<string, unknown>;
      return typeof item.id === "string" && typeof item.label === "string" && typeof item.text === "string";
    });
}

export function SocialCaptionGenerator() {
  const store = useAppStore();
  const [platform, setPlatform] = useState<SocialPlatform>(
    store.safeAreaTarget === "reels" ? "instagram" : "tiktok",
  );
  const [tone, setTone] = useState<CaptionTone>("simple");
  const [result, setResult] = useState<CaptionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedVerses = store.verses
    .filter((verse) => store.selectedVerseNumbers.includes(verse.verse_number))
    .sort((a, b) => a.verse_number - b.verse_number);
  const firstTranslated = selectedVerses.find((verse) => verse.translation?.trim());
  const reciter = store.audioSource.mode === "reciter" ? getReciter(store.reciterId) : undefined;
  const ready = !!store.surah && selectedVerses.length > 0;

  const generate = async () => {
    if (!store.surah || selectedVerses.length === 0) return;
    setLoading(true);
    setError(null);
    setCopiedId(null);
    try {
      const response = await fetch("/api/social-caption", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform,
          tone,
          surah: {
            number: store.surah.id,
            name: store.surah.name_simple,
            arabicName: store.surah.name_arabic,
          },
          verseNumbers: selectedVerses.map((verse) => verse.verse_number),
          ...(firstTranslated ? {
            excerpt: {
              verseNumber: firstTranslated.verse_number,
              translation: firstTranslated.translation,
            },
          } : {}),
          ...(reciter ? { reciterName: reciter.name } : {}),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).error === "string"
          ? (payload as Record<string, unknown>).error as string
          : "Captions could not be created right now.";
        throw new Error(message);
      }
      if (!isCaptionResponse(payload)) throw new Error("The caption response was incomplete. Please try again.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Captions could not be created right now.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (option: SocialCaptionOption) => {
    const copied = await copyText(option.text);
    if (!copied) {
      setError("Your browser blocked clipboard access. Select the caption text and copy it manually.");
      return;
    }
    setCopiedId(option.id);
    window.setTimeout(() => setCopiedId((current) => current === option.id ? null : current), 1_600);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-parchment">Post copy</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
          Exact reference, restrained framing, and platform-sized hashtags. No tafsir or invented verse meaning.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">Platform</p>
        <div className="grid grid-cols-3 gap-1 rounded-full border border-[var(--hairline-soft)] bg-[var(--ink-deep)] p-1">
          {PLATFORMS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setPlatform(option.id);
                setResult(null);
              }}
              className={`min-h-10 rounded-full px-2 text-xs font-medium transition-colors ${platform === option.id
                ? "bg-[var(--gold)] text-[var(--ink-deep)]"
                : "text-[var(--muted)] hover:text-parchment"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[var(--muted)]">Tone</p>
        {TONES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setTone(option.id);
              setResult(null);
            }}
            className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left transition-colors ${tone === option.id
              ? "border-gold/60 bg-gold/10"
              : "border-[var(--hairline-soft)] hover:border-[var(--hairline)]"
            }`}
          >
            <span className="text-xs font-medium text-parchment">{option.label}</span>
            <span className="text-right text-[10px] text-[var(--muted)]">{option.note}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void generate()}
        disabled={!ready || loading}
        className="btn-ghost flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm disabled:opacity-45"
      >
        {loading ? "Creating captions…" : result ? "Create three new options" : "Create three captions"}
      </button>
      {!ready && <p className="text-[11px] text-[var(--muted-deep)]">Choose at least one verse first.</p>}
      {error && <p role="alert" className="text-[11px] leading-relaxed text-red-300">{error}</p>}

      {result && (
        <div className="border-t border-[var(--hairline-soft)] pt-1">
          <div className="flex items-center justify-between gap-3 py-3">
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">{result.notice}</p>
            <span className="shrink-0 rounded-full border border-[var(--hairline-soft)] px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {result.source === "openai" ? "AI framing" : "Editorial"}
            </span>
          </div>
          <div className="divide-y divide-[var(--hairline-soft)]">
            {result.options.map((option) => (
              <article key={option.id} className="py-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-medium text-gold-soft">{option.label}</h3>
                  <button
                    type="button"
                    onClick={() => void copy(option)}
                    className="min-h-10 rounded-full border border-[var(--hairline-soft)] px-3 text-[11px] text-parchment hover:border-gold/60"
                  >
                    {copiedId === option.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[11px] leading-[1.65] text-[var(--muted)]">{option.text}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-[var(--muted-deep)]">
        Audio, video, and uploaded media never leave the browser. When AI is configured, only the Surah, verse reference, one translation excerpt, and reciter name are sent for framing.
      </p>
    </div>
  );
}
