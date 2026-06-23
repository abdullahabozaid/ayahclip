# Deep Align v2 — Forced Alignment + AI Supervisor

- **Date:** 2026-06-23
- **Status:** Draft (awaiting user review)
- **Owner:** AyahClip
- **Area:** Imported-audio verse alignment (`src/lib/forced-align.ts`, `src/lib/asr.ts`, `src/components/VerseCardEditor.tsx`)

## Problem

When a user imports their own recitation audio, the **Deep align** action is supposed to set each verse's start/end timestamp accurately. Today it doesn't:

- [asr.ts](../../../src/lib/asr.ts) runs the FastConformer Arabic CTC model and **greedily decodes** it to a transcript, throwing away the per-frame emission matrix ([decodeCTC](../../../src/lib/asr.ts#L197)).
- [forced-align.ts](../../../src/lib/forced-align.ts) then does **decode-then-fuzzy-match**: it aligns that lossy transcript to the known verse text with Needleman–Wunsch and reads off times. Its accuracy is capped by the small quantized model's *free transcription* quality, and where the decode is wrong/missing it **linearly interpolates** boundaries ([forced-align.ts:123](../../../src/lib/forced-align.ts#L123)) — smearing exactly the boundaries between verses that are recited with **no pause** between them.

The user's key requirement: alignment must be accurate **even when consecutive verses run together with no silence** (common in continuous recitation), and it must leave room for the verse **fade-in** so the next verse's intro animation completes as its recitation begins.

## Goals

1. Accurate per-verse boundaries for imported audio, **including no-pause transitions**.
2. Fade-in awareness: a verse's text appears early enough that its intro animation finishes by the time recitation starts.
3. Stay **local-first** and **offline-capable** for the core; no new model download.
4. Preserve preview↔export parity (no second render path) and the existing undo system.

## Non-goals (this spec)

- Multi-clip batch alignment (one imported clip at a time is fine for v1).
- Replacing the reciter-mode (library) timing path, which already has exact per-word timings from quran.com/QDC.
- A live, decoupled display-timeline (we bake the fade-in offset into the audio `start` for v1; see §M1.4).

## Decisions (locked with user)

| Fork | Decision |
|------|----------|
| Precision engine for no-pause boundaries | **True CTC forced alignment in-browser**, on the FastConformer emissions we already compute (not a Python sidecar, not cloud ASR). Escalate only if real-reciter accuracy proves insufficient. |
| Gemini's role / sequencing | **Core first, Gemini next.** Ship forced-alignment offline first; add the Gemini supervisor as Milestone 2. |
| Existing offline button | Preserved and improved (the offline Deep align path *is* what we upgrade). Gemini is additive on top. |
| Runtime | Local-first. Vercel works but M2's model call needs Pro + `maxDuration`; noted, not designed around. |

---

## Milestone 1 — In-browser CTC forced alignment (offline, no key)

### M1.1 Why forced alignment fixes no-pause

Forced alignment lays the **known** token sequence (the verse text) directly onto the audio's per-frame acoustic probabilities and finds the most likely monotonic path (Viterbi over a CTC trellis). Because it aligns *words/tokens* rather than detecting *silences*, it places a boundary at the acoustic word transition whether or not there's a pause. Reference: torchaudio CTC forced-alignment; Quran-specific prior art: `quran-align`, `lafzize`/`ctc-forced-aligner`.

### M1.2 Modules (each independently testable)

1. **`src/lib/asr.ts` — expose emissions.**
   Refactor the model run so it can return the raw `[T, V]` log-probability matrix + `frameDur` instead of only a decoded string. Add `computeEmissions(audio16k): { logProbs: Float32Array; T: number; V: number; frameDur: number }`. `transcribe()` (used by auto-detect / `matchVerses`) keeps its current behaviour, ideally reusing `computeEmissions` internally.
   - **Check during impl:** confirm the ONNX output is already `log_softmax`-normalized (NeMo CTC usually is). If it's raw logits, apply per-frame `log_softmax` before Viterbi. Greedy decode is unaffected either way.

2. **`src/lib/ctc-tokenizer.ts` — reference text → model token ids.**
   Build a reverse map from the vocab (`/asr-vocab.json`, currently loaded id→token in [asr.ts:177](../../../src/lib/asr.ts#L177)). Tokenize the **normalized** reference Arabic (same normalization the model emits — reuse/extend `normalizeArabicTimed`/`getVersesText` from `verse-match.ts`) into the model's `▁`-prefixed SentencePiece subwords via greedy longest-match. Output: the token-id sequence + the **first-token index for each verse** (so we can map tokens→verse boundaries). Unmappable characters are dropped and recorded as a gap.
   - **Primary risk** lives here: vocab/normalization parity. De-risked by unit tests + the §M1.6 spike.

3. **`src/lib/ctc-align.ts` — CTC Viterbi forced alignment.**
   Pure function: `ctcForcedAlign(logProbs, T, V, blankId, tokenIds): number[]` returning the start frame for each token. Standard CTC alignment: blank-interleaved target, allowed stay/advance (and skip-blank between distinct tokens) transitions, backtrace the best path. No network, no model — testable with tiny synthetic emission matrices.

4. **`src/lib/forced-align.ts` — rewrite `forceAlignVerses`.**
   Orchestrate: `computeEmissions` → `tokenize ref` → `ctcForcedAlign` → map each verse's first-token frame to a time (`frame * frameDur`) for `start`, and its last-token frame for recitation `end`. Keep the monotonic + `MIN_DUR` guards already present ([forced-align.ts:139-143](../../../src/lib/forced-align.ts#L139-L143)). Remove the interpolation-across-deletions logic (the smear source). Returns `VerseTiming[]`.
   - The caller [deepAlign in VerseCardEditor](../../../src/components/VerseCardEditor.tsx) changes from `transcribe → forceAlignVerses(hypText…)` to `computeEmissions → forceAlignVerses(emissions, surah, verseNumbers)`.

5. **Silence-snap refinement (reuse).**
   After alignment, for each boundary, if a `findSilenceCenters` pause ([audio-import.ts](../../../src/lib/audio-import.ts)) sits within ~±0.4 s, snap the boundary to the silence center for a clean cut; otherwise keep the acoustic word boundary. Pause case → tidy; no-pause case → untouched.

### M1.3 Data flow

```
audio (blob URL → AudioBuffer → 16k mono Float32)
  → computeEmissions  ──► logProbs[T,V], frameDur
reference verses (surah, lo..hi)
  → tokenizeRef       ──► tokenIds[], verseFirstTokenIdx[]
(logProbs, tokenIds)
  → ctcForcedAlign    ──► startFrame per token
map tokens→verses + monotonic/MIN_DUR + silence-snap + fade-in offset
  → VerseTiming[]  → commit() (existing undo) → store.setVerseTimings
```

### M1.4 Fade-in offset

Forced alignment yields each verse's recitation **onset** and **end**. For verse *i* (i>0), when an intro is enabled (`verseIntro !== "none"`):

```
gap_i        = onset_i − recitationEnd_{i-1}
offset_i     = min(verseIntroMs/1000, gap_i)
start_i      = onset_i − offset_i      // pulled back into the pre-roll silence
end_{i-1}    = start_i                 // contiguous, no audio gap
```

This makes the text fade in during the pause before the verse and be fully visible as recitation starts — i.e. "stop ~900 ms before the next verse." It **reuses the existing export/preview intro animation** ([export.ts:306-309](../../../src/lib/export.ts#L306-L309)), which already runs for `verseIntroMs` from a verse's start — no render-path change, parity preserved.

- The offset is computed from the **fade setting at align time**. If the user later changes the fade, re-run Deep align. (A fully decoupled `displayStart` field is a possible future enhancement; out of scope for v1.)
- When intro is "none", `offset_i = 0` (verses stay at their true onsets).

### M1.5 UX & fallback

- Same **✨ Deep align** button and progress states already in [VerseCardEditor](../../../src/components/VerseCardEditor.tsx) ("Listening…", model download %). The user's "loading, please wait" expectation is met by the existing inline progress.
- If forced alignment fails or is low-confidence (no usable token path, or gap coverage too low), fall back to today's pause-detection `autoSegment` — **no regression** vs current behaviour.
- Fully local/offline; first run still downloads the 131 MB model once (already cached in IndexedDB).

### M1.6 Testing

- **Unit:** `ctc-tokenizer` (known ref → expected subword ids; unmappable-char handling) and `ctc-align` (synthetic emissions with a known argmax path → expected token frames). Pure functions, fast vitest.
- **Spike/integration (do early):** run end-to-end on one of the user's real imported clips; eyeball boundaries including a **known no-pause transition**, compare against the current aligner. This validates vocab/normalization parity before the full build-out.
- Existing vitest timing/text guards stay green.

---

## Milestone 2 — Gemini supervisor (online, optional)

Adds robustness for messy audio; **timing precision still comes from M1's forced alignment** — Gemini supervises *assignment*, not millisecond timing (its audio timestamps are only ~second-level; confirmed via OpenRouter/Google docs).

- **Route:** `src/app/api/deep-align/route.ts`, **Node runtime** (not Edge — inference can exceed the 30 s Edge cap; long calls fine locally). Follows the existing FormData upload pattern (`/api/library`, `/api/save-export`).
- **Key:** `OPENROUTER_API_KEY`, server-only, read at module load like `PEXELS_API_KEY` in [api/pexels/route.ts](../../../src/app/api/pexels/route.ts); documented in `.env.example`. When absent, M1 runs standalone.
- **Model:** a **Gemini** model with audio input (e.g. `google/gemini-2.5-flash-lite` / `google/gemini-2.5-flash`) on OpenRouter. (Gemma cannot take audio.) Audio sent as base64 via the `input_audio` content type — OpenRouter requires base64, not a URL.
- **Input:** the recitation audio (16 kHz mono, compact) + each expected verse's **Arabic and English** text + the verse range.
- **Output (supervision hints, not final timings):** confirmation the right verses are recited; flags for extra speech (ta'awwudh / basmala), skipped verses, repeats, or wrong verses; rough per-verse regions to anchor M1 when the audio contains content outside the verse text. This is the user's "does this verse match what's being read" check, performed from audio.
- **Vercel caveat:** hosted deploys need Pro + `maxDuration`; local-first is unaffected.

---

## File-by-file change list

**M1**
- `src/lib/asr.ts` — add `computeEmissions()`, expose vocab/blankId for the tokenizer; keep `transcribe()`.
- `src/lib/ctc-tokenizer.ts` — **new**; reference Arabic → token-id sequence + verse-first-token indices.
- `src/lib/ctc-align.ts` — **new**; pure CTC Viterbi forced alignment.
- `src/lib/forced-align.ts` — rewrite `forceAlignVerses` to use emissions + forced alignment + silence-snap + fade-in offset.
- `src/components/VerseCardEditor.tsx` — update `deepAlign` to the emissions flow; keep fallback to `autoSegment`.
- Tests: `ctc-tokenizer` + `ctc-align` unit specs.

**M2 (later)**
- `src/app/api/deep-align/route.ts` — **new**; Node route → OpenRouter (audio + verse text → supervision hints).
- `.env.example` — document `OPENROUTER_API_KEY`.
- Wire supervisor hints into the M1 alignment as anchors.

## Spike findings (2026-06-23)

- **Vocab** (`public/asr-vocab.json`): 1025 SentencePiece subwords, `<blank>`=1024, `<unk>`=0, `▁` word-marker on 533 tokens. Carries **basic harakat** (fatha/kasra/damma/sukun/shadda/tanwin) embedded in subwords and as standalone tokens — but **not** Uthmani orthography (no superscript alef, waqf/pause marks).
- **Normalization**: `normalizeArabic` ([verse-match.ts:50](../../../src/lib/verse-match.ts#L50)) **strips all diacritics** + remaps letters — the existing pipeline aligns on the bare consonantal **skeleton**.
- **Implication**: to forced-align the skeleton reference against the diacritized emission vocab, **marginalize** emissions onto a reduced skeleton subword alphabet (logsumexp over full-vocab ids sharing a skeleton form; pure-diacritic/punct tokens fold into blank), then tokenize the skeleton reference into that reduced alphabet and align. Chosen because it matches the existing normalization and is robust to the model under-emitting harakat.
- **Log-softmax (Q1)**: resolved defensively — the aligner consumes log-probs; the integration applies a per-frame `log_softmax` to the ONNX output before alignment so it is valid regardless of whether NeMo already normalized.
- **Built + tested this session**: [`ctc-align.ts`](../../../src/lib/ctc-align.ts) (pure CTC Viterbi forced aligner) + [`ctc-align.test.ts`](../../../src/lib/__tests__/ctc-align.test.ts) — 7/7 green, incl. the no-pause boundary and mandatory-blank-between-repeats cases.

## Remaining to confirm (needs one real clip)

- Real-reciter accuracy on a no-pause transition: are the FastConformer emissions strong enough end-to-end, or do we escalate the acoustic model? This is the last empirical gate and is best validated **while building the tokenizer/marginalization** against a real recitation (ideally the Ar-Rum 1–7 clip).
