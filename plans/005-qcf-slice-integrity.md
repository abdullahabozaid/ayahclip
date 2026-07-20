# Plan 005: Make QCF partial-verse glyph slicing fail loudly and pin it with golden tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5e086f1..HEAD -- src/lib/render-core.ts src/lib/__tests__/timing.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (Quran text integrity is this product's stated fatal-bug class)
- **Effort**: M
- **Risk**: MED (changing sacred-text slicing must not regress the already-fixed waqf cases)
- **Depends on**: none
- **Category**: bug / correctness (Quran integrity)
- **Planned at**: commit `5e086f1`, 2026-07-20

## Why this matters

`sliceQcfForDisplay` maps a partial verse's plain-text tokens onto QCF glyphs for both preview and export (it is called from the shared `drawScene` path). Its token-matching loop has a silent failure mode: when the displayed part's tokens are **not found** as a contiguous run in the full verse text, `tokenOffset` silently stays `0` and the function slices glyphs **from the start of the verse** — rendering the wrong Quranic words with no error. A related drift risk: glyph-token coverage is counted from `qcfWords[].text_uthmani` while the offsets come from `verse.text_uthmani.split(/\s+/)`; any tokenization disagreement between the two sources (waqf marks are the known culprit — see memory of the 2026-06 fix) shifts the slice by a word. PRODUCT.md: "Mis-rendered Arabic … is a fatal bug." Wrong-but-rendered is worse than an explicit failure. This plan (a) adds a golden-test corpus pinning correct behavior on waqf-bearing split verses, (b) converts the silent no-match default into a detected condition with a safe fallback.

## Current state

- `src/lib/render-core.ts:129-163` — `sliceQcfForDisplay(verse, displayArabic, isLastPart)`. The exact code today:
  ```ts
  const allTokens = verse.text_uthmani.split(/\s+/).filter(Boolean);
  const partTokens = displayArabic.split(/\s+/).filter(Boolean);
  let tokenOffset = 0;
  for (let i = 0; i <= allTokens.length - partTokens.length; i++) {
    if (allTokens.slice(i, i + partTokens.length).every((word, j) => word === partTokens[j])) {
      tokenOffset = i;
      break;
    }
  }
  const tokenEnd = tokenOffset + partTokens.length;
  let coveredTokens = 0;
  const sliced = fullQcf
    .filter((word) => word.char_type_name !== "end")
    .filter((word) => {
      const wordStart = coveredTokens;
      coveredTokens += Math.max(1, word.text_uthmani.split(/\s+/).filter(Boolean).length);
      return coveredTokens > tokenOffset && wordStart < tokenEnd;
    });
  ```
  Note: if the search loop never matches, `tokenOffset` remains 0 — indistinguishable from a legitimate match at position 0.
- Callers: `grep -rn "sliceQcfForDisplay" src/` — used by the draw path and covered lightly by `src/lib/__tests__/timing.test.ts` (imports it at line 20).
- History/context you must respect (from the project's fix log):
  - Waqf marks (ۖ ۗ ۚ …) can appear as separate tokens in `text_uthmani` while a single QCF glyph carries word+mark — the `Math.max(1, …)` span counting exists for this; do not regress it.
  - A prior bug ("QCF showed wrong words at waqf-mark split boundaries") was fixed by matching against simple-split text; splits are produced by verse-splitting logic in `src/lib/` (see `verseTextAt` in `src/lib/audio-import.ts` for how display text for a split segment is derived).
- Test conventions: vitest, table-driven, in `src/lib/__tests__/`. `timing.test.ts` is the exemplar and already constructs verse fixtures with `qcfWords`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0              |
| Targeted  | `npm test -- timing`     | pass                |
| Full unit | `npm test`               | all pass            |
| Lint      | `npm run lint`           | exit 0              |

## Scope

**In scope**:
- `src/lib/render-core.ts` (ONLY `sliceQcfForDisplay` and, if needed, a small exported helper next to it)
- `src/lib/__tests__/timing.test.ts` or a new `src/lib/__tests__/qcf-slice.test.ts`

**Out of scope**:
- `drawScene` and all drawing/layout code in `render-core.ts` — untouched.
- The split-generation logic (`audio-import.ts`, `timing-ops.ts`) — the slicer must be robust to its outputs, not change them.
- Any font-loading code (`qcf-font-loader.ts`).

## Git workflow

- Branch: current working branch unless instructed otherwise.
- Commit style: plain imperative sentence, e.g. `Pin QCF partial-verse slicing with golden tests`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterize current behavior with a golden corpus (BEFORE changing code)

Create `src/lib/__tests__/qcf-slice.test.ts`. Build fixtures as plain objects `{ text_uthmani, qcfWords }` where `qcfWords` entries have `text_uthmani` and `char_type_name` (copy the fixture shape from `timing.test.ts`). Cover, with REAL Uthmani text (copy exact strings from `data/` fixtures or the Quran API cache if present in the repo — search `grep -rln "text_uthmani" data/ src/lib/__tests__/`; if no real verse data is available in-repo, construct Arabic strings including genuine waqf marks ۖ ۗ ۚ):

1. Full verse (displayArabic === text_uthmani) → returns full qcfWords unchanged.
2. First-half split, no waqf → correct prefix glyphs, no `end` glyph.
3. Last-part split → suffix glyphs + the `end` (verse-number) glyph appended.
4. Split at a waqf boundary where one glyph covers word+mark (glyph `text_uthmani` = "word ۖ" two tokens) → no off-by-one (this is the historical bug; assert the exact expected glyph subset).
5. Middle part of a three-way split → correct interior window.
6. **No-match input** (displayArabic tokens not present contiguously, e.g. reordered or from a different verse) → CURRENT behavior slices from position 0; assert instead the NEW safe behavior from Step 2 (write this case after Step 2, or write it expecting the new contract and let it fail until Step 2 lands — repo superpowers habit is test-first; either order is fine as long as cases 1–5 pass before AND after the change).

**Verify**: `npm test -- qcf-slice` → cases 1–5 pass against the unmodified implementation (proving the fixtures encode today's correct behavior).

### Step 2: Detect the no-match case and fall back safely

In `sliceQcfForDisplay`, track whether the contiguous search actually matched:

```ts
let tokenOffset = -1;
for (let i = 0; i <= allTokens.length - partTokens.length; i++) { ... tokenOffset = i; break; }
if (tokenOffset === -1) {
  // The display text is not a contiguous slice of this verse. Slicing glyphs
  // by guess risks rendering the wrong Quranic words — the one failure class
  // this product must never ship silently. Render the full verse instead and
  // report loudly in dev.
  if (process.env.NODE_ENV !== "production") {
    console.error("sliceQcfForDisplay: display text not found in verse; rendering full verse glyphs", { displayArabic });
  }
  return fullQcf;
}
```

Falling back to the FULL verse glyphs is the safe choice: complete, correctly-ordered Quran text (merely un-split) rather than a wrong subset. Do not throw — a throw inside `drawScene`'s call path would blank the frame in export.

**Verify**: `npm test -- qcf-slice` → all 6 cases pass. `npm test` → full suite green (especially `timing.test.ts` and `parity.test.ts`).

### Step 3: Assert coverage-count consistency (drift tripwire)

Add a cheap invariant in the same function after building `sliced`: in non-production, if `fullQcf` (excluding `end` glyphs) covers a total token count `!== allTokens.length`, `console.error` once per verse (dedupe with a module-level `Set` keyed on `verse.text_uthmani.slice(0, 32)`), because offsets are then meaningless even when the search "matched". Keep production silent and behavior unchanged (still return the computed slice — the mismatch usually still renders correctly when the discrepancy is after `tokenEnd`).

Add test case 7: fixture with a glyph list whose token total disagrees with `text_uthmani` → slice still returned, error logged in test env (assert via `vi.spyOn(console, "error")`).

**Verify**: `npm test` → all pass; `npm run lint`; `npx tsc --noEmit`.

## Test plan

Cases 1–7 above in `src/lib/__tests__/qcf-slice.test.ts`, modeled on `timing.test.ts`. The corpus is the durable asset: future rendering changes must keep it green (memory rule: fixed Quran-integrity bugs must never reappear).

## Done criteria

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all exit 0
- [ ] `src/lib/__tests__/qcf-slice.test.ts` exists with ≥7 cases incl. a waqf-boundary split and the no-match fallback
- [ ] `grep -n "tokenOffset = 0" src/lib/render-core.ts` → no match (silent default eliminated)
- [ ] No behavior change for matching inputs: cases 1–5 use fixtures written against the PRE-change implementation and still pass
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current implementation does not match the excerpt (drift).
- Cases 1–5 do NOT pass against the unmodified code — that means the fixtures are wrong OR you've rediscovered a live slicing bug; report which glyphs came out before changing anything.
- Any existing test (`timing`, `parity`) breaks after Step 2 — the fallback changed behavior some caller depended on; report the caller.
- You cannot find real Uthmani fixture text in-repo AND cannot confidently construct waqf-bearing Arabic — do not invent plausible-looking Arabic; report and request fixture text.

## Maintenance notes

- Any future change to verse splitting (`timing-ops.ts`, `audio-import.ts` `verseTextAt`) or to the QCF word source must keep this corpus green; extend it with each new split feature.
- The dev-only `console.error` is intentionally loud — if it fires in normal use, that's a data-pipeline bug (Quran.com tokenization vs QCF glyph payloads) worth a session of its own.
- Reviewer scrutiny: confirm the full-verse fallback interacts sanely with the highlight bar / word-highlight features (they index into the sliced array; a longer array must not crash them — check `grep -rn "sliceQcfForDisplay" src/` call sites handle length differences).
