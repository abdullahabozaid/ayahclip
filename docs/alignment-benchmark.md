# Ayah recognition and alignment benchmark

This is a reproducible, real-audio regression check for the browser ASR and
hybrid verse aligner. It complements the synthetic unit suite; it does not
claim broad Quran-wide accuracy yet.

## Method

- Source: public per-ayah MP3 files from EveryAyah.
- Passage: Al-Fatihah 1:1–7.
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
npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/alafasy
npx tsx scripts/evaluate-alignment.ts tmp/alignment-benchmark/alafasy --trim-silence
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

## Remaining gates

- Expand beyond Al-Fatihah to long verses, mid-verse starts, muqatta'at, repeated
  phrases, and clips containing non-recitation speech or music.
- Add phone recordings and unseen reciters using a leakage-free licensed set.
- Persist per-boundary confidence and surface low-agreement boundaries in the
  timeline instead of showing one undifferentiated “aligned” state.
- Keep manual correction first-class; model output is never Quran text authority.
