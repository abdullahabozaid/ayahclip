# Ayah recognition and alignment benchmark

This is a reproducible, real-audio regression check for the browser ASR and
hybrid verse aligner. It complements the synthetic unit suite; it does not
claim broad Quran-wide accuracy yet.

## Method

- Source: public per-ayah MP3 files from EveryAyah.
- Core passage: Al-Fatihah 1:1–7.
- Reciters: Mishary Alafasy, Muhammad Al-Minshawi, Abdul Rahman Al-Sudais,
  Mahmoud Al-Husary, and Abdul Basit (Murattal).
- Ground truth: each MP3 is decoded independently, then PCM is concatenated, so
  the original file junctions are exact verse-cut labels.
- Natural mode retains each recording's pauses.
- Run-on mode trims leading/trailing silence from each verse before concatenation,
  testing alignment when pause detection cannot identify the boundaries.
- Metric: mean and maximum absolute error of internal verse cuts. The first
  clip start is excluded from the aggregate because it is speech-trim policy,
  not a verse boundary.

Run one case with:

```sh
npm run benchmark:fixtures
npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/alafasy
npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/alafasy --trim-silence
npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/holdout-hudhaify --phone --music-snr 12
npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/holdout-ayyoub --intro-seconds 2
npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/holdout-ayyoub --intro-seconds 2 --recognition-offset 2.289
```

## Results (2026-07-16)

| Reciter | Natural mean / max | Run-on mean / max | Detection |
|---|---:|---:|---|
| Alafasy | 0.158s / 0.364s | 0.186s / 0.587s | 1:1–7, high |
| Minshawi | 0.075s / 0.153s | 0.222s / 0.673s | 1:1–7, high |
| Sudais | 0.125s / 0.222s | 0.176s / 0.500s | 1:1–7, high |
| Husary | 0.284s / 0.409s | 0.180s / 0.605s | 1:1–7, high |
| Abdul Basit | 0.291s / 0.564s | 0.155s / 0.525s | 1:1–7, recovered |

Natural aggregate mean: **0.187s**. Run-on aggregate mean: **0.184s**.

Abdul Basit's natural recording exposed an important detection failure: greedy
ASR omitted the audible basmala and initially returned 1:2–7 with high textual
confidence. The production pipeline now compares the first CTC character time
with the first voiced sample and recovers the preceding verse when several
seconds of speech would otherwise be discarded. Recovered ranges are downgraded
for user review rather than presented as unquestionable.

### Expanded passage coverage

The same Alafasy recording set was then tested against four structurally
different passages. Each was evaluated with natural pauses and again after
removing every per-ayah leading/trailing silence.

| Passage / failure class | Natural mean / max | Run-on mean / max | Detection |
|---|---:|---:|---|
| Al-Baqarah 2:1–5 · muqattaʿāt | 0.139s / 0.331s | 0.209s / 0.354s | high |
| Al-Fajr 89:6–10 · mid-surah start | 0.202s / 0.287s | 0.106s / 0.207s | high |
| Al-Baqarah 2:255–256 · starts 18s inside ayah 255 | 0.063s / 0.063s | 0.198s / 0.198s | high |
| Al-Baqarah 2:254–256 · long ayah | 0.096s / 0.132s | 0.370s / 0.468s | high |
| Ar-Rahman 55:13–16 · repeated refrain | 0.150s / 0.220s | 0.080s / 0.141s | medium / high |

The partial-start case uses `--crop-first 18`; despite a 0.25–0.26 character
error rate because the known reference includes the omitted opening, detection
still returns 2:255–256 at high confidence and the internal verse cut remains
within 0.20s in both modes.

The repeated refrain initially exposed a real method-selection failure: global
transcript alignment jumped verse 16 about 0.8s early even though CTC and a
strong pause agreed near the correct cut. Boundary-level fusion now switches
only that disputed boundary to the acoustically supported cut. Natural mean
error improved from **0.335s to 0.150s** and maximum error from **0.774s to
0.220s**, while the pause-free run-on result remained at **0.080s mean**.

The original five-reciter matrix was rerun after fusion and remained unchanged,
confirming the edge-case fix did not regress the established baseline.

### Hold-out voices and capture stressors

Three voices absent from the original tuning matrix were added as a slow release
gate. The deterministic stress modes preserve sample-exact boundaries while
approximating a narrow-band phone capture and a low-level tonal background.

| Hold-out case | Natural mean / max | Run-on mean / max | Detection |
|---|---:|---:|---|
| Saad Al-Ghamadi | 0.103s / 0.300s | 0.231s / 0.630s | 1:1–7, high |
| Ali Al-Hudhaify | 0.153s / 0.247s | 0.218s / 0.605s | 1:1–7, high |
| Muhammad Ayyoub | 0.165s / 0.346s | 0.191s / 0.637s | 1:1–7, high |
| Hudhaify · phone band + 12 dB background | 0.378s / 0.764s | 0.171s / 0.605s | 1:1–7, high |

A two-second non-speech tonal intro exposed a genuine normalization failure:
detection fell to low confidence and internal cuts reached **1.184s mean / 2.477s
max**. The production pipeline now retries only when the first model pass itself
reports a substantial unrecognised opening span. It keeps 350ms of pre-roll and
maps the cropped pass back to original-file time. The same fixture then returns
1:1–7 at high confidence with **0.167s mean / 0.336s max** cut error.

Retry comparison deliberately excludes diagnostic 0, which represents the clip
trim rather than an internal ayah cut. This prevents a cropped second pass from
winning or losing because of start-trim confidence while its creator-visible
internal boundaries are worse. The full 13-case matrix was rerun after this
correction with no regression.

Run the complete slow gate with:

```sh
npm run benchmark:fixtures
npm run test:alignment
```

Run the manifest-driven recognition smoke gate with the repository's existing
licensed fixtures:

```sh
npm run benchmark:recognition-corpus -- scripts/fixtures/recognition-smoke.jsonl \
  --min-exact 0.7 --min-candidate-recall 0.7 --max-false-auto 0
```

The recognition evaluator is also the onboarding path for private, licensed
unseen-handset audio. Its JSONL rows accept `audio`, `surah`, `ayahStart`, and
`ayahEnd`; audio paths resolve relative to the manifest and remain outside git.
Directories may use either `surah_ayah_...` filenames or EveryAyah's compact
six-digit `SSSAAA.mp3` convention.

For a release corpus, also record the conditions that make each case useful:

```json
{"id":"phone-room-001","audio":"./private/phone-room-001.wav","surah":55,"ayahStart":13,"ayahEnd":16,"tags":["phone","room-echo","compression","background-speech","unseen-reciter"],"license":"Upstream dataset terms and version","reciter":"holdout-reciter-id","device":"captured handset model"}
```

The evaluator prints metrics for every tag instead of allowing one aggregate
number to hide a missing or weak stress condition. A strict private-corpus gate
can require both coverage and provenance:

```sh
npm run benchmark:recognition-corpus -- /absolute/private/path/manifest.jsonl \
  --min-cases 30 \
  --min-candidate-recall 0.95 \
  --min-auto-applies 10 \
  --min-auto-precision 1 \
  --max-false-auto 0 \
  --require-tags phone,room-echo,compression,background-speech,unseen-reciter \
  --min-cases-per-tag 5 \
  --min-tag-candidate-recall 0.90 \
  --max-tag-false-auto 0 \
  --require-license-metadata
```

`--require-license-metadata` proves only that provenance was recorded; the
person running the corpus must still verify and accept the upstream terms.

The isolated-ayah release matrix now runs 73 files across eight voices plus
opening-letter, long-ayah, mid-surah, and repeated-refrain edge passages. Its
release boundary is deliberately safety-first: **zero false auto-applies**, at
least 40 useful auto-applies, and at least 0.84 candidate recall. Repeated text
such as Ar-Rahman's refrain is offered for creator selection rather than assigned
to the first identical occurrence. Run it with:

```sh
npm run benchmark:fixtures
npm run test:recognition
```

## Remaining gates

- The reproducible harness now includes three hold-out voices plus deterministic
  phone-band and synthetic background-audio stress modes. These are regression
  stressors, not a substitute for the remaining real handset/mixed-speech corpus.
- Add real clips containing mixed non-recitation Arabic speech and real handset
  recordings using a leakage-free licensed set. Gate each required condition
  explicitly rather than relying on the aggregate score.
- Calibrate the persisted per-boundary confidence thresholds against the future
  unseen-reciter and mixed-audio sets; low-agreement cuts are already saved and
  surfaced as amber review markers in the timeline.
- Keep manual correction first-class; model output is never Quran text authority.
- The import flow now exposes distinct top matches for repeated or ambiguous text,
  prepares editable cuts for each option, and lets the creator choose before the
  required Quran-range confirmation. A cancelled or failed retry keeps the last
  usable result instead of clearing it.
- See [recognition-model-review.md](recognition-model-review.md) for the acoustic
  model replacement gate and current evidence.
