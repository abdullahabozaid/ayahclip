# Plan 008: Bulk recognition & clipping — the road from "40%" to reliable

> Research-grounded roadmap. The two quick wins (review drafts, caption on/off)
> shipped 2026-07-20. This plan captures the larger improvements, ordered by
> leverage. Each is independently plannable; several are model/architecture
> changes needing owner sign-off on cost.

## Status

- **Priority**: P1 (bulk is the flagship workflow and is unreliable on real content)
- **Effort**: mixed (S → XL, per item)
- **Category**: direction / recognition quality
- **Planned at**: commit (post-review-drafts), 2026-07-20

## Context: why bulk produced "0 drafts, 8 ambiguous withheld"

Root cause (confirmed): `bulk-recognition.ts` discarded the fully-built, corpus-aligned candidate ranges that "ambiguous" windows already carry. Fixed 2026-07-20 by surfacing the top candidate as a LOW-confidence review draft (unapproved, "review range" badge). But the deeper reason so many windows land "ambiguous" remains, and is the real work:

1. **`hasCompetingRecognitionWindow` misfires** (`verse-match.ts:612-627`): it flags any pause-window candidate that is a *non-overlapping same-surah* range (`ayahStart > primary.ayahEnd`) as "competing", even though that's normal inside a 4-min continuous recitation. This forces confident single-surah windows into "ambiguous".
2. **4-min windows** force a single contiguous range over 5-15 ayahs; accumulated greedy-CTC errors drop `match.score` below the strict `0.84/0.9` floors → "low" → withheld.
3. **Generic Arabic ASR** (`asr.ts`, FastConformer greedy CTC, no LM/beam) degrades on melodic tajweed/elongation.
4. **No cross-window merge** — the plan (`docs/2026-07-19-bulk-quran-clips-plan.md:122`) specifies merging a continuous surah/ayah sequence across windows; it doesn't exist.

## Research findings (2026-07-20) that shape the fix

- **Closed-vocabulary forced alignment beats open ASR.** The winning pattern (quran-align ~73ms boundary error; Tadabur/WhisperX): identify the passage, then align the *known* ayah text to the audio with a dictionary filtered to that passage. Recognition becomes a closed problem. Refs: github.com/cpfair/quran-align, github.com/m-bain/whisperx.
- **Quran-tuned models exist**: `tarteel-ai/whisper-base-ar-quran`, phonetic `wav2vec2-quran-phonetics` (robust to elongation). RecitID proves audio→surah/ayah fuzzy-match is feasible (~18s/snippet).
- **Opus Clip UX**: transcribe → cut on sentence/silence/scene → **rank by a virality score** → present a scored review grid; word-by-word "karaoke" burned captions are the biggest "feels finished" signal.
- **Already-captioned sources**: mainstream clippers double-caption (a known flaw). Detect burned-in text via OCR on the lower third (PaddleOCR-WASM, Arabic-capable) or an edge-density heuristic across sampled frames; then crop-away / keep-original / cover-and-replace. Never trust a stranger's burned-in Arabic (text-integrity risk) — prefer cover-and-replace with verified corpus text.

## Roadmap (by leverage)

### A. Fix the competing-window false trigger — S, HIGH leverage — ✅ DONE 2026-07-21
`hasCompetingRecognitionWindow`: treat non-overlapping *same-surah* pause windows as expected (not competing); only flag a genuinely different surah, or a materially higher-scoring disagreement. This alone should move many windows from "ambiguous" back to confidently "matched".
- **RISK**: it's shared with the single-clip editor auto-apply. MUST gate on the recognition benchmark (`npm run test:recognition`, `test:detection`) proving zero new false auto-applies before/after. Do not ship without that evidence.
- **Shipped**: removed the over-broad `.some()` clause in `verse-match.ts` that flagged any non-overlapping same-surah window (`ayahEnd < primary.ayahStart` / `ayahStart > primary.ayahEnd`) as competing — the normal case inside a 4-min continuous recitation. Now only a different surah in any window, or the strongest window materially out-scoring the whole-clip match while disagreeing (`strongestDisagrees`), competes. Added unit tests (non-overlapping later same-surah allowed; different surah still flags). **Benchmark evidence** (before == after): `test:recognition` 43 safe auto-applies, 1.000 precision, 1.000 candidate recall; `test:detection` 18/18; `test:alignment` 14/14; `test:mixed-speech` no false auto-apply. Zero new false auto-applies.

### B. Cross-window merge into a continuous sequence — M — ✅ DONE 2026-07-21
Merge adjacent windows' ayahs into one continuous surah/ayah timeline (the plan's step 3), so a long recitation is reconstructed rather than each 4-min window self-classifying. Reduces boundary loss and lets confidence accrue over the whole passage.
- **Shipped**: the dedup + continuous-run reconstruction already existed (`mergeBulkAyahs` + run-building in `buildVerseCompleteCandidates`). Added the missing confidence-accrual step: `corroborateBulkAyahs` promotes a `low` ayah to `medium` only when deductively pinned — bracketed both sides by high/medium same-surah ayahs at exactly verseNumber∓1 with a small gap — so a continuous passage auto-approves as one clip. Conservative negative cases (single neighbour, unverified neighbour, non-consecutive, surah change, large gap) never promote. Unit-tested. Recommend a live multi-window run to confirm yield before relying on it in production.

### C. Smaller/adaptive windows + silence-aware cuts — M — ✅ DONE 2026-07-21 (silence-aware cuts)
Cut windows at silence gaps (reciters pause between ayat) instead of fixed 4-min slices; combine textual ayah boundary + acoustic silence for clean "complete-thought" clips. Smaller windows raise per-window match confidence.
- **Shipped**: `silenceAwareWindows` snaps each window boundary to the longest pause within tolerance of the target (tie-broken by closeness), falling back to the fixed target for pause-less sources, with a small overlap guarding straddling ayat. `recognizeQuranInWindows` derives silences once (`findSilenceCenters`) and uses pause-aligned windows. Deterministic → checkpoint resume stays stable. Unit-tested without audio. (Adaptive/smaller target sizes left as a follow-up knob.)

### D. Closed-vocabulary alignment pass — L
Once a window's surah is identified (even at low confidence), re-align using a dictionary filtered to that passage's words (quran-align style). Turns "guess the range" into "align known text", sharply improving both recall and boundary accuracy — even with the current ASR.

### E. Quran-tuned recognition model — L/XL (owner: model hosting cost)
Swap/augment `asr-model-v1` with `tarteel-ai/whisper-base-ar-quran` or a phonetic wav2vec2. Benchmark WER on melodic recitation first (the repo has no such benchmark yet — `docs/recognition-model-review.md`). Bundle-size and in-browser latency are the constraints.

### F. Clip ranking / review grid — M — ✅ DONE 2026-07-21 (scoring; UI wiring pending)
Score each draft (complete-ayah, clean silence padding at cuts, 20-60s duration, confidence) and present a ranked grid à la Opus Clip, so review is skim-and-approve, not scrub. Complements the review-draft work already shipped.
- **Shipped**: `scoreBulkCandidate` (0-1, confidence × duration-fit to the muted-autoplay sweet spot) + `rankBulkCandidates` (stable best-first). Advisory ordering only — never approves or changes a range, so outside the integrity gate. Unit-tested. **Remaining**: wire `rankBulkCandidates` into `BulkCreateWorkspace` to present the review grid best-first.

### G. Burned-in caption detection → smart caption strategy — L
Detect burned-in captions (sampled-frame edge-density heuristic first; PaddleOCR-WASM if needed) and auto-suggest the caption mode (the on/off toggle shipped 2026-07-20 is the manual version). Offer crop-away / keep-original / cover-and-replace; default cover-and-replace with verified text.

### H. Word-highlight (karaoke) captions in EXPORT — M — ✅ DONE 2026-07-21
`wordHighlight` renders in preview but NOT in the exported MP4 (see plans/README.md addendum). The forced-alignment word timestamps already exist; drive per-word highlight through `drawScene` in the export frame loop, and add `wordHighlight` to the render-cache key. Biggest muted-autoplay "feels finished" win.
- **Shipped**: `activeHighlightWord` (exact proportional formula from imported-player) computes the lit word per frame in BOTH export paths. `exportVideoFast` adds it to the run-length frame key (so each newly-lit word is encoded, never collapsed); `exportRealtime` renders every frame while a highlighted verse plays. `drawFrame` overrides emphasis to the color style, matching the preview. Gated to wordHighlight + imported audio + full-verse display, so ordinary exports are unchanged. `ExportOptions.wordHighlight` added (studio already passed it). Pure helper unit-tested; final visual wants one real export to eyeball. (Used the preview's proportional word timing rather than alignedWordStarts, matching what the creator already sees — swap to alignedWordStarts later if per-word acoustic timing is wanted.)

## Recommended order

A (quick, high leverage, benchmark-gated) → B → C → F, then the larger D/E/G/H as owner-approved model/infra work. A+B+C together should take bulk from "0 drafts on hard content" to "mostly confident drafts + a few to review".

## Done criteria (per item)

Each item ships behind: `npm run test:recognition` + `test:detection` green (no new false auto-applies), unit tests for new pure logic, and a live multi-window bulk run on a real recitation showing improved confident-draft yield. Quran integrity is the hard gate — never present an unverified range as confident/approved.

## Maintenance notes

- The review-draft surfacing (shipped) is the safety net: even as recognition improves, ambiguous windows must always become reviewable drafts, never silent 0-output.
- A/B/D touch `verse-match.ts`/`quran-recognition.ts` — the Quran-integrity core. Every change there is benchmark-gated.
