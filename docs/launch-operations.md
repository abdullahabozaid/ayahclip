# AyahClip launch operations

This runbook covers the public creator journey, privacy-safe product events, client error monitoring, and the export release matrix.

## Creator journey

Use [`docs/public-beta-field-test.md`](./public-beta-field-test.md) for the unassisted ordinary-creator protocol, physical-device matrix, pass thresholds, and privacy-safe result sheet. Automated events support that evidence; they do not replace direct observation on real devices.

The measurable path is:

1. `journey_started`, with `firstVisit: true` for a browser that has not opened Import before.
2. `source_loaded`, after the browser successfully decodes an audio or video source.
3. `range_confirmed`, when the creator explicitly confirms the Quran range.
4. `template_chosen`, when a template is applied.
5. `studio_opened`, when the editing surface opens.
6. `export_succeeded`, after the exact MP4 or fallback WebM is rendered.
7. `journey_feedback`, when a first-export creator answers whether they reached the final preview without help.

Each event carries one random browser-session journey ID. To calculate the first-run funnel, filter Vercel Runtime Logs for `ayahclip_product_event`, group by `journeyId`, and count distinct journeys reaching each ordered milestone. The unassisted completion measure is:

`without_help feedback / all journey_feedback responses`

Keep preview and download outcomes separate with `exportAction`. A preview proves successful rendering. A download proves the creator asked AyahClip to deliver the rendered file.

## Privacy boundary

The telemetry route accepts only the fields defined in `src/lib/telemetry-schema.ts`. Unknown keys are discarded. Never add any of the following:

- audio, video, image, or blob data;
- file names, project names, URLs, or referrers;
- Quran text, translations, detected transcripts, or selected ayah ranges;
- raw exception messages, stack traces, or user-agent strings;
- IP addresses, advertising identifiers, or persistent user identifiers.

The client honours Do Not Track and the preference on `/privacy`. Diagnostics must never block editing or export.

## Error monitoring

Filter Runtime Logs for either of these fields:

- `"event":"client_error"`
- `"event":"export_failed"`

Errors are classified locally into fixed categories such as `network_failure`, `storage_failure`, `font_failure`, `media_failure`, and `encoder_failure`. Use the coarse browser family and device class to identify clusters. Ask an affected creator to copy `/diagnostics` only when more detail is required; that report remains local until they deliberately copy it.

## Release gates

Run the ordinary gate before every production publish:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:detection
npm run test:recognition
npm run test:alignment
npm run build
npm run test:e2e
```

`npm run test:e2e` includes Android Chromium and iPhone WebKit device profiles. On a capable local host they require real encoded video bytes and duration. GitHub's isolated Linux runner has no usable mobile H.264/AAC encoder, so CI verifies the complete touch workflow and enabled export controls while leaving byte-level encoding to the matrix below.

Run the several-minute constrained-memory gate before an export-related release:

```bash
npm run test:export-matrix
```

The export matrix sets a 512 MB V8 heap, reports `navigator.deviceMemory = 4`, imports 181 seconds of audio, and requires a playable MP4 longer than 180 seconds.

Run the installed Google Chrome and Google Search metadata gate before a public release:

```bash
npm run test:google-chrome
```

After the production deployment is ready, verify the deployed routes, security headers and a real MP4 render in installed Google Chrome:

```bash
npm run test:production-google
```

`/robots.txt` advertises `/sitemap.xml`; the sitemap contains only public, indexable product pages. Browser-local libraries, editing surfaces, diagnostics and thank-you routes publish `noindex`. To connect Google Search Console, set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to the verification token supplied by Google, redeploy, confirm the verification meta tag, and submit `https://ayahclip.vercel.app/sitemap.xml`. Indexing itself remains Google's decision and can take time.

Browser profiles are not physical phones. Before announcing broad availability, repeat a short import, final-preview, Save Video and camera-roll playback check on current iPhone Safari and Android Chrome hardware. Record the operating-system version, browser version, source format, clip duration, output type and result. Do not call the physical-device gate complete from emulation alone.
