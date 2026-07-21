# Plan 011: Launch polish — kill the orphan route, fix brand copy, and close the a11y/mobile gaps

> **Executor instructions**: This is a bundle of small, independent launch fixes.
> Do them in the order below; each has its own verify step. You may commit per
> lettered group. On a "STOP condition", stop and report. When done, update this
> plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d06dd5a..HEAD -- src/app src/components src/lib/backgrounds.ts src/app/globals.css DESIGN.md package.json`
> If a cited file changed, confirm the excerpt still matches before editing it.

## Status
- **Priority**: P1 (launch — public brand surface, accessibility, mobile touch)
- **Effort**: S–M (bundle; each item is S)
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / ux / a11y / tech-debt
- **Planned at**: commit `d06dd5a`, 2026-07-21

## Why this matters
The site is going public at ayahclip.com. This bundle removes an internal artifact that currently ships to production, brings the highest-visibility copy back in line with the owner's plain-copy rule, and fixes accessibility/mobile-touch gaps on the product's core content (Quran text) and its mobile-first surfaces. Each item is individually small; together they are the difference between "looks launched" and "looks unfinished."

## Commands you will need
| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Unit tests | `npm test` | all pass |

## Scope
**In scope**: the specific files/lines listed per item below, plus `package.json` (group F). **Out of scope**: any render/export logic, the studio canvas pipeline, and store/state — this plan is copy, markup attributes, Tailwind classes, CSS, and one script entry only.

---

## Group A — Remove the orphan `/design-showcase` route (DEBT-02 / UX-05)
`src/app/design-showcase/page.tsx` (251 lines) is an internal design-audit page: it has **no link anywhere** (`grep -rn "design-showcase" src` finds only the route itself), it renders internal to-do notes, it hard-codes a private `superdesign.dev/teams/…` URL (`:11`), and it is backed by `public/design-audit/*.png` (~5.7 MB, 14 files). It is publicly routable and indexable at `ayahclip.com/design-showcase`.

**Do**: delete `src/app/design-showcase/` and `public/design-audit/`. (If the owner wants to keep it as a dev reference instead, the fallback is: add `export const metadata = { robots: { index: false, follow: false } }` and gate the render on `process.env.NODE_ENV !== "production"` — but deletion is preferred for launch.)

**Verify**: `grep -rn "design-showcase" src` → no matches; `ls public/design-audit 2>/dev/null` → absent; `npm run build` → exit 0.

## Group B — Plain copy on the most-seen surfaces (COPY-01/02/03)
The owner's rule bans flowery/AI words ("luminous", "sanctuary", and — per the team's own note at the deleted showcase — "craft"/"polished"). Replace with the sanctioned voice ("Make beautiful Quran clips" / "Make a video for TikTok, Reels, or Shorts").
- `src/app/opengraph-image.tsx:77` (and `alt` at `:3`) — "Craft luminous recitation clips." → plain line. (This renders on every shared link.)
- `src/app/layout.tsx:55` — description "Craft polished…" → plain.
- `src/app/manifest.ts:8` — description → plain (keep it consistent with layout).
- `src/app/studio/page.tsx:592` — "begin crafting your clip" → e.g. "start your clip".
- `src/components/SiteFooter.tsx:37` — "AyahClip is a personal tool for crafting…" → reframe as a free public tool, dropping "personal tool" (post-launch pivot) and "crafting".
- `src/lib/backgrounds.ts:51` — preset label "River sanctuary" → "River" (or "Riverbank").

**Verify**: `grep -rniE "luminous|sanctuary|\bcraft" src/app src/components src/lib` → no user-facing matches (a comment is fine; a rendered string is not). `npm run build` → exit 0.

## Group C — Accessibility (A11Y-01/02/03/04)
- **A11Y-01 (highest value)**: add `lang="ar"` beside the existing `dir="rtl"` on Quran/Arabic text blocks — `VersePicker.tsx:48`, `surah/[id]/page.tsx:126`, `import/page.tsx:1091` & `:1134`, `QcfVerse.tsx:36`/`:47`, `VerseCardEditor.tsx:984`, `TimelineEditor.tsx:1712`/`:1989`, `ReciterSelect.tsx:168`, `page.tsx:165` (hero basmala). **Preferred**: if these share (or can share) one Arabic-text component, set `lang="ar"` there once so it can't drift; otherwise add per-site.
- **A11Y-02**: `src/components/templates/TemplateGallery.tsx` has two `<h1>` (`:87`, `:102`) — demote the second (`:102`) to `<h2>`.
- **A11Y-03**: `src/components/SiteNav.tsx` active state is color-only (`:113-115` desktop, `:84-88` mobile) — add `aria-current={active ? "page" : undefined}` and a non-color marker (underline/dot).
- **A11Y-04**: `src/app/browse/page.tsx:24` and `src/components/templates/ExampleClipCard.tsx:112` replace the global focus ring with only a border change identical to hover — restore a distinct `focus-visible:ring-2 ring-gold ring-offset-2` (offset against the page bg).

**Verify**: `grep -rn 'dir="rtl"' src | wc -l` and `grep -rn 'lang="ar"' src | wc -l` — the second should now be ≥ the count of Quran-text sites; `npx tsc --noEmit` → exit 0; `npm run build` → exit 0. (If e2e axe is available: `npm run test:accessibility`.)

## Group D — Mobile touch targets (MOBILE-UX-01, UX-02, UX-03)
Design rule (`DESIGN.md:65`): ≥40px floor / 44px ideal on touch; compact 32–36px is desktop-only.
- **MOBILE-UX-01**: the docked timeline transports are 32px on phones — `TimelineEditor.tsx:1261` (play/pause), `:1301`/`:1312` (skip), `:1417`/`:1428` (nudge) use `compact ? "h-8 w-8" : …`; the dock passes `compact` at every breakpoint (`studio/page.tsx:1020`). Give the compact transports a touch floor, e.g. `h-11 w-11 md:h-8 md:w-8`, since the dock is the phone editing surface.
- **UX-02**: `library/page.tsx` per-clip actions are 24–28px — select checkmark `:784` (`h-6 w-6`), Schedule/Posted/Unmark `:879-899` (`py-1.5 text-[11px]`), download & delete `:900-917` (`p-1.5`, `h-3.5` icon), Set-thumbnail `:798`. Raise to ≥40px on touch (icon buttons `h-10 w-10`, text `min-h-11`), collapsing to compact at `sm+`.
- **UX-03**: `library/page.tsx:768-776` play badge is `opacity-0 hover:opacity-100` (invisible on touch) — show by default on coarse pointers, e.g. `opacity-100 sm:opacity-0 sm:hover:opacity-100`.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0; visually confirm on a ~375px viewport if a browser is available.

## Group E — Motion, contrast, microcopy (UX-04/06/07/08)
- **UX-06**: `src/app/globals.css:285-290` reduced-motion block zeroes `*-duration` but not `animation-delay`; the `.rise` dashboard stagger (`page.tsx:289`, `i*50ms`) then keeps content invisible then pops in. Add `animation-delay: 0.01ms !important;` (and a `scroll-behavior: auto` reset) to that block.
- **UX-04**: sync `DESIGN.md:18-19` (`--muted #8a8fa3`, `--muted-deep #5a607a`) to the shipped values in `globals.css:30-31` (`#a9adbd`, `#777d95`); add a note not to use `--muted-deep` below ~12px on `--surface` (it's near the AA floor). Docs-only change.
- **UX-07**: raise `text-[9px]` to 10–11px at `StudioSettings.tsx:782` & `:1209`, `SocialCaptionGenerator.tsx:198`, `PlatformChrome.tsx:206`.
- **UX-08**: `src/app/page.tsx:188` hero CTA row has no `flex-wrap`; a returning user gets a 3rd pill (`:201`) that overflows ~360px phones — add `flex-wrap`.

**Verify**: `grep -rn "text-\[9px\]" src` → no matches; `npx tsc --noEmit`, `npm run build` → exit 0.

## Group F — Quick wins (DX-01, DEBT-01)
- **DX-01**: add `"typecheck": "tsc --noEmit"` to `package.json` scripts (CI already runs the raw command; this just gives contributors/agents `npm run typecheck`).
- **DEBT-01**: consolidate the 5 `mm:ss` re-implementations onto the tested canonical `formatTimecode` (`src/lib/source-link.ts:67`): delete local `fmt`/`fmtDuration` in `TimelineEditor.tsx:39`, `VerseCardEditor.tsx:37`, `BackgroundPicker.tsx:16`, `bulk/BulkCreateWorkspace.tsx:78`, and the inline one at `import/page.tsx:554` (that file already imports `formatTimecode` at `:53`). If any caller needs sub-second/tenths, add an optional `{ decimals }` arg to `formatTimecode` rather than keeping a copy.

**Verify**: `npm run typecheck` → exit 0; `grep -rn "const fmt = \|function fmt(\|fmtDuration" src` → no matches (or only the canonical); `npm test` → all pass (formatTimecode is already unit-tested).

## Done criteria
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all exit 0
- [ ] `grep -rn "design-showcase" src` → no matches; `public/design-audit/` gone
- [ ] `grep -rniE "luminous|sanctuary" src/app src/components src/lib` → no rendered matches
- [ ] `grep -rn 'lang="ar"' src` count ≥ the Quran-text sites listed in Group C
- [ ] `grep -rn "text-\[9px\]" src` → no matches
- [ ] `npm run typecheck` exists and passes; no `fmt`/`fmtDuration` duplicates remain
- [ ] Only in-scope files modified; `plans/README.md` row updated

## STOP conditions
- Deleting `/design-showcase` breaks the build because something imports from it (grep says nothing does — if the build disagrees, report the importer).
- A cited line's content differs from the excerpt (drift) — fix the item at its real location or report if it's gone.
- Adding `lang="ar"` visibly changes font shaping/selection for the worse on any Quran block (it shouldn't; it improves shaping) — report before reverting.

## Maintenance notes
- Centralizing `lang="ar"` + `dir="rtl"` into one Arabic-text component (Group C) is the durable fix; per-site attributes will drift again. Note this for a follow-up if you add per-site here.
- The plain-copy rule is a recurring review item — a reviewer should scan any new user-facing string for the banned words.
- If `/design-showcase` is kept behind a dev guard instead of deleted, add it to the `robots` noindex set and move `public/design-audit/` out of the shipped bundle.
