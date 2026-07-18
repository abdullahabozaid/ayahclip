# Reciter source and catalog audit

Date: 2026-07-18

## Decision

AyahClip now exposes 79 verified recitation recordings: 46 distinct Hafs voices/styles from EveryAyah and 33 complete timed Hafs recordings from MP3Quran. The remaining EveryAyah folders are lower-bitrate duplicates, translations, Warsh recordings, support files, or alternate folder spellings.

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

MP3Quran is the first additional provider to pass the complete production admission gate and is enabled through AyahClip's shared `chapter-cues` engine.

- The official [MP3Quran developer API](https://www.mp3quran.net/ar/api) publishes reciter, riwayah, complete-Surah, ayah-timing, and timed-read endpoints. It explicitly documents chapter audio servers and per-ayah start/end times.
- The official [MP3Quran usage policy](https://www.mp3quran.net/privacy-en.html) says that visitors and developers may copy site material or use site links. AyahClip must still attribute MP3Quran and preserve the recorded reciter identity and removal contact.
- The live API returned 115 timed reads on 2026-07-18. Joining those read IDs to the English catalog produced 96 complete 114-Surah Hafs recordings with official cue data.
- Representative candidates missing from the current EveryAyah catalog include Mansour Al-Salimi, Ahmad Al-Nufais, Raad Al-Kurdi, Anas Al-Emadi, Khalid Al-Jileel, Idrees Abkr, Bandar Balilah, Abdullah Al-Buaijan, and Abdulaziz Al-Turki.
- The catalog also explains why attractive names cannot be enabled uniformly: Hazza Al-Balushi currently advertises 83 Surahs, while Muhammad Al-Luhaidan has 114 Surahs but is absent from the official timed-read list.

The audio servers support HTTPS, browser CORS, byte ranges, and stable three-digit chapter URLs. The timing endpoint returned complete cue counts for 1:1, 2:255, 55:13, and 114:6 for read 245 (Mansour Al-Salimi), including all 286 Al-Baqarah ayahs.

MP3Quran recordings are chapter files, not one file per ayah. Mansour Al-Salimi's Al-Baqarah file is roughly 268 MB, so AyahClip never downloads a whole chapter to export one selected ayah. The production engine resolves the official ayah cue, reads the MP3 stream header, requests only a padded byte range, rejects variable-rate ranges that would make byte seeking unsafe, and passes the same decoded window to both preview and export.

The admitted MP3Quran reads are Abdelbari Al-Toubayti (49), Abdullah Al-Buaijan (58), Abdullah Khayyat (61), Abdulwadood Haneef (71), Emad Zuhair Hafez (78), Khalid Al-Mohana (159), Bandar Balilah (217), Raad Al-Kurdi (221), Muhammad Khalil Al-Qari (229), Mansour Al-Salimi (245), Ahmad Al-Nufais (259), Peshawa Qadr Al-Kurdi (268), Abdulaziz Al-Turki (282), Anas Al-Emadi (314), Idrees Abkr (12), Khalid Al-Jileel (20), Ahmad Al-Hawashi (6), Abdul Aziz Al-Ahmad (55), Abdullah Al-Mousa (243), Abdulrahman Al-Oosi (225), Haitham Al-Dokhin (273), Tawfeeq As-Sayegh (17), Abdulrasheed Soufi (258), Muhammad Burhaji (340), Abdullah Al-Khalaf (244), Khalid Abdulkafi (22), Majed Al-Zamil (139), Saleh Alshamrani (300), Hassan Aldaghriri (10905), Alzain Mohammad Ahmad (13), Ahmad Deban (265), Sayed Ahmad Hashemi (294), and Wadeea Al-Yamani (219). Each has 114 advertised Surahs, 114 official timing files, complete representative cue coverage, CORS, byte ranges, attribution, and a real browser MP4 fixture.

The 2026-07-18 expansion gate rejected Ibrahim Al-Dosari (232), Ahmad Issa Al-Maasarawi (289), and Ahmad Shaheen (256) because their exact browser MP4s were materially shorter than the official 114:6 cues. Hasan Saleh (299) and Abdulwali Al-Arkani (72) also remain unadmitted because representative official cues were implausibly short and require manual semantic review. A successful HTTP response is not sufficient evidence for Quranically complete playback.

The six-read expansion is grouped under Makkah and Madinah because the available biographies establish the connection rather than because of the audio provider alone: the Saudi Press Agency identifies Abdelbari Al-Toubayti and Khalid Al-Mohana as imams and preachers of the Prophet's Mosque; Makkah Scholars records Abdullah Khayyat as an imam of the Grand Mosque; Abdulwadood Haneef served as an imam in the Two Holy Mosques; Emad Zuhair Hafez served at Quba and led Taraweeh at the Prophet's Mosque; and Muhammad Khalil Al-Qari served as an imam of the Prophet's Mosque and Quba. Sources: [SPA, Al-Toubayti](https://www.spa.gov.sa/N2314789), [Makkah Scholars, Abdullah Khayyat](https://www.makkahscholars.org/scholars/115), [Okaz, Abdulwadood Haneef](https://www.okaz.com.sa/news/local/2188341), [IslamHouse, Emad Zuhair Hafez](https://islamhouse.com/lite/index.php/author/725025?lang=ar), [SPA, Khalid Al-Mohana](https://www.spa.gov.sa/N2615722), and [Al Jazeera, Muhammad Khalil Al-Qari](https://www.aljazeera.net/misc/2023/5/8/%D8%AD%D8%B2%D9%86-%D9%88%D9%86%D8%B9%D9%8A-%D8%B9%D9%82%D8%A8-%D9%88%D9%81%D8%A7%D8%A9-%D8%A7%D9%84%D8%B4%D9%8A%D8%AE-%D9%85%D8%AD%D9%85%D8%AF-%D8%AE%D9%84%D9%8A%D9%84).

`e2e/mp3quran-reciter-matrix.spec.ts` previews and exports 114:6 for every admitted read except Mansour Al-Salimi and compares the MP4 duration with that read's official cue. Mansour Al-Salimi passes the same gate plus selection, save, dashboard reopen, preview, and exact-duration export in `e2e/reciter-export.spec.ts`.

Run `npm run audit:mp3quran-provider -- --output /tmp/mp3quran-audit.json` to reproduce the catalog join, 114-Surah timing check, representative cue checks, CORS checks, and byte-range checks. Use `--read <id>` to evaluate another complete timed Hafs recording.

Decision: **production-admitted for the 33 audited reads above**. Other MP3Quran reads remain candidates until they independently pass the same catalog, cue, CORS, range, browser-preview, and MP4-duration gates.

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
5. **Completed:** implement MP3Quran chapter-cue playback and byte-range export, then admit only recordings that pass the complete browser test.
6. **Completed and continuing expansion:** 33 timed reads are admitted, including additional Haramain-linked voices, and the searchable, keyboard-complete catalog supports region, recitation style, word-synchronised capability, favourites, and recent voices.

### Verification checkpoint

On 2026-07-18, `npm run check:reciter-sources -- --output <report.json>` tested four references for every catalog entry: 1:1, 2:255, 55:13, and 114:6. The expanded catalog is required to pass 316/316 live source probes plus the 32-read browser MP4 matrix and Mansour Al-Salimi's dedicated export journey before publication.
