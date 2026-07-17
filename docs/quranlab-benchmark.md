# Quran-Lab real-phone recognition gate

AyahClip can evaluate the gated
`Quran-Lab/quranic-asr-benchmark` without storing or redistributing its audio.
The benchmark contains 600 leakage-free clips, including 200 held-out real
phone-microphone recordings in `tlog_holdout`.

The dataset requires manual Hugging Face approval. Accept its terms yourself:
ASR research/evaluation only; no redistribution, voice cloning, TTS, or
re-identification. Do not commit the downloaded directory or generated
manifest.

After access is approved:

```bash
hf download Quran-Lab/quranic-asr-benchmark \
  --repo-type dataset \
  --local-dir tmp/quranic-asr-benchmark

npm run benchmark:prepare-quranlab -- \
  tmp/quranic-asr-benchmark \
  --source tlog_holdout

npm run benchmark:recognition-corpus -- \
  tmp/quranic-asr-benchmark/ayahclip-manifest.jsonl \
  --min-cases 100 \
  --min-candidate-recall 0.95 \
  --min-auto-precision 1 \
  --max-false-auto 0 \
  --require-tags phone,unseen-reciter \
  --min-cases-per-tag 100 \
  --min-tag-candidate-recall 0.9 \
  --max-tag-false-auto 0 \
  --require-license-metadata
```

The converter resolves only reference text that maps to one Quran ayah. It
skips repeated or otherwise ambiguous text rather than guessing an occurrence.
Generated rows retain the source, evaluation terms, device type, and stressor
tags. Audio paths continue pointing into the gated local download.
