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

## Remaining gates

- Add real clips containing mixed non-recitation speech or music. Text-level
  adversarial Arabic speech/greeting/shahada/takbir cases are rejected, but the
  acoustic model still needs mixed-audio evaluation.
- Add phone recordings and unseen reciters using a leakage-free licensed set.
- Calibrate the persisted per-boundary confidence thresholds against the future
  unseen-reciter and mixed-audio sets; low-agreement cuts are already saved and
  surfaced as amber review markers in the timeline.
- Keep manual correction first-class; model output is never Quran text authority.
