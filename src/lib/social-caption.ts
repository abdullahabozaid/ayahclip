export const SOCIAL_PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export const CAPTION_TONES = ["simple", "reflective"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type CaptionTone = (typeof CAPTION_TONES)[number];

export interface SocialCaptionRequest {
  platform: SocialPlatform;
  tone: CaptionTone;
  surah: {
    number: number;
    name: string;
    arabicName?: string;
  };
  verseNumbers: number[];
  excerpt?: {
    verseNumber: number;
    translation: string;
  };
  reciterName?: string;
}

export interface CaptionFrame {
  intro: string;
  closing: string;
  hashtags: string[];
}

export interface SocialCaptionOption {
  id: string;
  label: string;
  text: string;
}

const PLATFORM_TAGS: Record<SocialPlatform, string[]> = {
  tiktok: ["Quran", "QuranRecitation", "IslamicReminder", "TikTokMuslim"],
  instagram: ["Quran", "QuranRecitation", "QuranVerses", "IslamicReminder", "Reels"],
  youtube: ["Quran", "QuranRecitation", "Shorts"],
};

const LABELS: Record<CaptionTone, string[]> = {
  simple: ["Quiet", "Direct", "Saveable"],
  reflective: ["Pause", "Reflect", "Share"],
};

function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 && cleaned.length <= max ? cleaned : null;
}

function safeName(value: unknown, max: number): string | null {
  const cleaned = cleanLine(value, max);
  if (!cleaned || /[<>]/.test(cleaned)) return null;
  return cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseSocialCaptionRequest(input: unknown): SocialCaptionRequest | null {
  if (!isRecord(input) || !isRecord(input.surah)) return null;
  if (!SOCIAL_PLATFORMS.includes(input.platform as SocialPlatform)) return null;
  if (!CAPTION_TONES.includes(input.tone as CaptionTone)) return null;

  const number = input.surah.number;
  const name = safeName(input.surah.name, 80);
  const arabicName = input.surah.arabicName == null ? undefined : safeName(input.surah.arabicName, 80);
  if (!Number.isInteger(number) || (number as number) < 1 || (number as number) > 114 || !name) return null;
  if (input.surah.arabicName != null && !arabicName) return null;
  if (!Array.isArray(input.verseNumbers) || input.verseNumbers.length < 1 || input.verseNumbers.length > 300) return null;

  const verseNumbers = Array.from(new Set(input.verseNumbers));
  if (verseNumbers.some((verse) => !Number.isInteger(verse) || verse < 1 || verse > 300)) return null;
  verseNumbers.sort((a, b) => a - b);

  let excerpt: SocialCaptionRequest["excerpt"];
  if (input.excerpt != null) {
    if (!isRecord(input.excerpt)) return null;
    const verseNumber = input.excerpt.verseNumber;
    const translation = cleanLine(input.excerpt.translation, 1_200);
    if (!Number.isInteger(verseNumber) || !verseNumbers.includes(verseNumber as number) || !translation) return null;
    excerpt = { verseNumber: verseNumber as number, translation };
  }

  const reciterName = input.reciterName == null ? undefined : safeName(input.reciterName, 100);
  if (input.reciterName != null && !reciterName) return null;

  return {
    platform: input.platform as SocialPlatform,
    tone: input.tone as CaptionTone,
    surah: { number: number as number, name, ...(arabicName ? { arabicName } : {}) },
    verseNumbers,
    ...(excerpt ? { excerpt } : {}),
    ...(reciterName ? { reciterName } : {}),
  };
}

export function verseReference(request: SocialCaptionRequest): string {
  const { number } = request.surah;
  const verses = request.verseNumbers;
  const contiguous = verses.every((verse, index) => index === 0 || verse === verses[index - 1] + 1);
  const range = contiguous && verses.length > 1
    ? `${number}:${verses[0]}–${verses.at(-1)}`
    : verses.length <= 5
      ? verses.map((verse) => `${number}:${verse}`).join(", ")
      : `${number}:${verses[0]}–${verses.at(-1)} (${verses.length} selected)`;
  return `Surah ${request.surah.name} ${range}`;
}

function surahTag(name: string): string {
  const compact = name.replace(/[^a-zA-Z0-9]/g, "");
  return compact ? `Surah${compact}` : "QuranVerses";
}

function normalizeHashtags(values: string[], request: SocialCaptionRequest): string[] {
  const limit = request.platform === "instagram" ? 6 : request.platform === "tiktok" ? 5 : 3;
  const all = [...values, ...PLATFORM_TAGS[request.platform], surahTag(request.surah.name)]
    .map((value) => value.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter((value) => value.length >= 2 && value.length <= 36);
  return Array.from(new Set(all.map((value) => value.toLowerCase())))
    .slice(0, limit)
    .map((value) => `#${value}`);
}

function safeGeneratedLine(value: unknown, max: number): string | null {
  const line = cleanLine(value, max);
  if (!line) return null;
  const unsafeClaim = /\b(allah says|this verse means|these verses mean|teaches us that|promises that|guarantees|proves that|commands us to)\b/i;
  if (unsafeClaim.test(line) || /["“”]/.test(line)) return null;
  return line;
}

export function normalizeCaptionFrames(input: unknown): CaptionFrame[] | null {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const frames: CaptionFrame[] = [];
  for (const value of input) {
    if (!isRecord(value) || !Array.isArray(value.hashtags)) return null;
    const intro = safeGeneratedLine(value.intro, 140);
    const closing = safeGeneratedLine(value.closing, 100);
    const hashtags = value.hashtags
      .map((tag) => cleanLine(tag, 36))
      .filter((tag): tag is string => !!tag)
      .slice(0, 6);
    if (!intro || !closing) return null;
    frames.push({ intro, closing, hashtags });
  }
  return frames;
}

export function editorialCaptionFrames(request: SocialCaptionRequest): CaptionFrame[] {
  const simple = [
    [`A quiet pause with Surah ${request.surah.name}.`, "Listen, reflect, and share with care."],
    [`Take a moment for this recitation from Surah ${request.surah.name}.`, "Save it for your next Quran break."],
    ["A few unhurried moments with the Quran.", "Listen again when you have a quiet moment."],
  ];
  const reflective = [
    ["Pause here and listen without rushing.", "Keep the reference close and return to the full Surah."],
    [`Sit with this recitation from Surah ${request.surah.name}.`, "Read the surrounding verses when you can."],
    ["A calm moment for listening and reflection.", "Share the recitation with its reference intact."],
  ];
  return (request.tone === "simple" ? simple : reflective).map(([intro, closing]) => ({
    intro,
    closing,
    hashtags: PLATFORM_TAGS[request.platform],
  }));
}

export function buildSocialCaptionOptions(
  request: SocialCaptionRequest,
  frames: CaptionFrame[],
): SocialCaptionOption[] {
  const reference = verseReference(request);
  const exactExcerpt = request.excerpt && request.excerpt.translation.length <= 360
    ? `“${request.excerpt.translation}”\n\n`
    : "";
  const credit = request.reciterName ? ` · Recited by ${request.reciterName}` : "";

  return frames.slice(0, 3).map((frame, index) => {
    const tags = normalizeHashtags(frame.hashtags, request).join(" ");
    return {
      id: `${request.platform}-${request.tone}-${index + 1}`,
      label: LABELS[request.tone][index] ?? `Option ${index + 1}`,
      text: `${frame.intro}\n\n${exactExcerpt}${reference}${credit}\n\n${frame.closing}\n\n${tags}`.trim(),
    };
  });
}
