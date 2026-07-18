# Reciter source and catalog audit

Date: 2026-07-18

## Decision

AyahClip currently exposes 46 verified recitation recordings from EveryAyah. This is effectively the complete set of distinct Hafs reciters and recording styles in EveryAyah's live public directory; the remaining folders are lower-bitrate duplicates, translations, Warsh recordings, support files, or alternate folder spellings.

The catalog should not be made to look larger by adding duplicate bitrates or by pointing at recordings whose reuse terms, completeness, CORS behaviour, or ayah boundaries have not been verified. More names without a dependable export path would make the product less trustworthy.

## Competitor evidence

[Quranify's Google Play listing](https://play.google.com/store/apps/details?id=com.mchutov.Quranify) currently names several modern reciters missing from AyahClip, including Abdul Rahman Mossad, Bader Al-Turki, Hazza Al-Balushi, Mahdi Ash-Shishani, Mansour Al-Salimi, and Muhammad Al-Luhaidan. Its public listing is useful catalog research, but it is not a license grant and does not document stable ayah-level audio endpoints.

The [Quranify browser extension listing](https://chromewebstore.google.com/detail/quranify-quran-player-rec/heagmjbabogideokhokpdlkdkbkdfffl) describes 40-plus reciters and user-authored audio sources. That supports adding search, recent choices, and source-aware organization; it does not establish permission to copy Quranify's audio catalog.

## Source audit

### EveryAyah

- Existing production source.
- Stable per-ayah URL shape and complete verse playback for the current entries.
- The live directory was enumerated on 2026-07-18 and compared with `src/lib/reciters.ts`.
- The production catalog already represents its distinct Hafs voices and styles. Lower-bitrate duplicates should remain hidden.

### Quran Foundation

The official [Recitations API documentation](https://api-docs.quran.com/docs/content_apis_versioned/4.0.0/recitations/) distinguishes ayah-by-ayah recitation IDs from chapter-reciter IDs. AyahClip currently uses the documented timing-capable subset only for word-synchronised splitting. A chapter-reciter ID must never be treated as an interchangeable per-ayah or word-timing ID.

Quran Foundation remains the preferred source for timing metadata when a recording has a documented matching ID. New integrations must use server-side credentials where the current API requires them and must preserve Quran Foundation's attribution and access terms.

### QuranLab metadata

The public [QuranLab audio reference layer](https://huggingface.co/datasets/quranlab/quran-audio) provides a useful taxonomy, source URLs, coverage flags, numbering-risk flags, and license fields. It deliberately hosts no audio. Its EveryAyah rows are marked reference-only and `commercial_ok: false`, so the dataset is discovery evidence, not a blanket commercial reuse grant.

QuranLab can help validate names, riwayah, completeness, and source provenance. AyahClip must still verify the upstream source and rights for each recording before enabling it in production.

### MP3Quran

MP3Quran is the first additional provider to pass the legal-discovery and catalog-coverage parts of the admission gate, but it is not enabled yet.

- The official [MP3Quran developer API](https://www.mp3quran.net/ar/api) publishes reciter, riwayah, complete-Surah, ayah-timing, and timed-read endpoints. It explicitly documents chapter audio servers and per-ayah start/end times.
- The official [MP3Quran usage policy](https://www.mp3quran.net/privacy-en.html) says that visitors and developers may copy site material or use site links. AyahClip must still attribute MP3Quran and preserve the recorded reciter identity and removal contact.
- The live API returned 115 timed reads on 2026-07-18. Joining those read IDs to the English catalog produced 96 complete 114-Surah Hafs recordings with official cue data.
- Representative candidates missing from the current EveryAyah catalog include Mansour Al-Salimi, Ahmad Al-Nufais, Raad Al-Kurdi, Anas Al-Emadi, Khalid Al-Jileel, Idrees Abkr, Bandar Balilah, Abdullah Al-Buaijan, and Abdulaziz Al-Turki.
- The catalog also explains why attractive names cannot be enabled uniformly: Hazza Al-Balushi currently advertises 83 Surahs, while Muhammad Al-Luhaidan has 114 Surahs but is absent from the official timed-read list.

The audio servers support HTTPS, browser CORS, byte ranges, and stable three-digit chapter URLs. The timing endpoint returned complete cue counts for 1:1, 2:255, 55:13, and 114:6 for read 245 (Mansour Al-Salimi), including all 286 Al-Baqarah ayahs.

The remaining blocker is export architecture. MP3Quran recordings are chapter files, not one file per ayah. Mansour Al-Salimi's Al-Baqarah file is roughly 268 MB; downloading and decoding the whole chapter to export one selected ayah would not be production-safe. A range prototype downloaded and decoded only the cue neighbourhood successfully, but the browser preview/export path must implement and verify the same chapter-cue range strategy before the voice is admitted.

Run `npm run audit:mp3quran-provider -- --output /tmp/mp3quran-audit.json` to reproduce the catalog join, 114-Surah timing check, representative cue checks, CORS checks, and byte-range checks. Use `--read <id>` to evaluate another complete timed Hafs recording.

Decision: **provider candidate, not yet production-admitted**. The next source implementation is a reusable `chapter-cues` engine, followed by real preview and MP4 export tests. Do not add MP3Quran names to the selector before those tests pass.

### AQQD

The [AQQD primary dataset paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC13285623/) describes a CC0 release with 24,183 short WAV clips from 309 reciters. It is valuable for Qira'at research and future recognition evaluation, but it fails the reciter-library coverage gate: the current release covers selected passages from 70 of 114 Surahs, only 19 of which are complete. It must not be presented as a complete reciter source.

Decision: **reject for production reciter playback; retain as a research/evaluation candidate subject to its own provenance review**.

### Research datasets

The gated benchmark requested by the owner is restricted to ASR research and evaluation. It must not supply production reciter audio, exports, voice cloning, TTS, or redistribution. Research access and product audio rights are separate concerns.

## Production admission gate

A new recitation is enabled only when all of these are recorded and tested:

1. Correct reciter identity, Arabic name, riwayah, style, and provenance.
2. Explicit upstream terms compatible with AyahClip's intended public use.
3. Complete coverage for the advertised mode: all 6,236 ayahs, or all 114 Surahs plus verified ayah boundary metadata.
4. HTTPS and browser CORS support for preview and canvas export.
5. Stable URLs with a documented fallback or health-check strategy.
6. Verified numbering, including Bismillah handling and any riwayah divergence.
7. Audio spot checks across the beginning, middle, and end of the Quran.
8. Preview, playback, save, reopen, and exported-video tests.
9. Accurate capability labels: whole-ayah, word-synchronised, or chapter audio with verified cuts.
10. Attribution and removal contact stored with the source record.

## Required architecture before the next source

The current `Reciter.folder` model assumes one EveryAyah URL pattern. Expand it to a discriminated source descriptor rather than adding one-off URL conditions:

```ts
type ReciterAudioSource =
  | { kind: "everyayah"; folder: string }
  | { kind: "verse-manifest"; manifestId: string }
  | { kind: "chapter-cues"; reciterId: string; cueVersion: string };
```

The shared resolver should return the audio URL, source attribution, timing capability, and a recoverable availability result. Preview and export must use the same resolver so a voice cannot work in the editor and fail during rendering.

## Catalog UX direction

- Replace the 46-option native select only when the replacement remains keyboard and screen-reader complete.
- Search English and Arabic names.
- Organize by useful creator decisions: Makkah and Madinah, recitation style, word-synchronised capability, recent, and favourites.
- Keep variants under one reciter name instead of presenting duplicate personalities.
- Show capability and provenance in the selection result, not as marketing badges.
- Never promise “verified voices” unless source availability and coverage are checked by automation.

## Next implementation checkpoint

1. **Completed:** introduce the source descriptor and resolver without changing current playback.
2. **Completed:** add unit tests proving URL, attribution, and timing capability resolution for every current entry.
3. **Completed:** add a source-health script that probes representative ayahs and emits a machine-readable report.
4. **Completed:** evaluate MP3Quran and AQQD against the production admission gate.
5. Implement MP3Quran chapter-cue playback and byte-range export, then admit only the recordings that pass the complete browser test.
6. Add the admitted modern reciters and ship the searchable catalog UI.

### Verification checkpoint

On 2026-07-18, `npm run check:reciter-sources -- --output <report.json>` tested four references for every catalog entry: 1:1, 2:255, 55:13, and 114:6. All 184 requests returned audio with browser-compatible CORS. The resolver is also exercised by a real browser journey that previews the upstream recitation and renders a final MP4.
