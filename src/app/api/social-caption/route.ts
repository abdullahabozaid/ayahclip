import {
  buildSocialCaptionOptions,
  editorialCaptionFrames,
  normalizeCaptionFrames,
  parseSocialCaptionRequest,
  verseReference,
  type CaptionFrame,
  type SocialCaptionRequest,
} from "@/lib/social-caption";

export const dynamic = "force-dynamic";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CAPTION_MODEL = process.env.OPENAI_CAPTION_MODEL ?? "gpt-5.6-luna";
const MAX_BODY_BYTES = 12_288;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    frames: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          intro: { type: "string", minLength: 1, maxLength: 140 },
          closing: { type: "string", minLength: 1, maxLength: 100 },
          hashtags: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 2, maxLength: 36 },
          },
        },
        required: ["intro", "closing", "hashtags"],
      },
    },
  },
  required: ["frames"],
} as const;

function requestKey(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim().slice(0, 80);
}

function isRateLimited(request: Request): boolean {
  const now = Date.now();
  const key = requestKey(request);
  const existing = attempts.get(key);
  if (!existing || existing.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_REQUESTS_PER_WINDOW;
}

function outputText(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return null;
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") return text;
    }
  }
  return null;
}

async function openAIFrames(request: SocialCaptionRequest): Promise<CaptionFrame[] | null> {
  if (!OPENAI_API_KEY) return null;
  const excerpt = request.excerpt?.translation ?? "No translation excerpt is included.";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_CAPTION_MODEL,
      store: false,
      max_output_tokens: 700,
      instructions: [
        "You write restrained social-media framing for Quran recitation clips.",
        "Return exactly three distinct options. Do not quote, paraphrase, explain, interpret, or make claims about a verse.",
        "Do not write tafsir, religious rulings, promises, commands attributed to Allah, engagement bait, or invented facts.",
        "The app inserts the exact translation and reference separately. Write only a short intro, a short closing, and relevant hashtags.",
        "Use calm natural English. Avoid emojis, sensational language, guilt, all caps, and generic AI phrasing.",
      ].join(" "),
      input: JSON.stringify({
        platform: request.platform,
        tone: request.tone,
        surah: request.surah.name,
        reference: verseReference(request),
        exactTranslationForContextOnly: excerpt,
        reciter: request.reciterName ?? null,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "ayahclip_social_caption_frames",
          strict: true,
          schema: OUTPUT_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    console.warn(`[social-caption] OpenAI request failed with status ${response.status}`);
    return null;
  }
  const text = outputText(await response.json());
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { frames?: unknown };
    return normalizeCaptionFrames(parsed.frames);
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isRateLimited(request)) {
    return Response.json(
      { error: "Please wait a moment before creating more captions." },
      { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return Response.json({ error: "Payload too large" }, { status: 413 });
    input = JSON.parse(body);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const captionRequest = parseSocialCaptionRequest(input);
  if (!captionRequest) return Response.json({ error: "Invalid caption request" }, { status: 400 });

  let frames: CaptionFrame[] | null = null;
  if (OPENAI_API_KEY) {
    try {
      frames = await openAIFrames(captionRequest);
    } catch (error) {
      console.warn("[social-caption] OpenAI request unavailable", error instanceof Error ? error.name : "unknown");
    }
  }
  const source = frames ? "openai" : "editorial";
  const options = buildSocialCaptionOptions(
    captionRequest,
    frames ?? editorialCaptionFrames(captionRequest),
  );
  return Response.json(
    {
      source,
      options,
      notice: source === "openai"
        ? "AI shaped the surrounding copy. The Quran translation and reference remain exact. Review before posting."
        : "Created locally from reviewed editorial patterns. The Quran translation and reference remain exact.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
