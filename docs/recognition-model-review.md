# Quran recognition model review

Reviewed 2026-07-16. This is the decision record for AyahClip's local acoustic
model. Model output proposes a Quran range and timings; it is never treated as
Quran text authority.

## Production baseline

- Asset: `fastconformer_ar_ctc_q8.onnx`
- GitHub release: `asr-model-v1`, published 2026-05-27
- Size: 131,652,337 bytes
- SHA-256: `7e7f9aaccbf0f7d12104ebfee9a99625195454a359821139a777f389ec928b50`
- Vocabulary: 1,025 entries in `public/asr-vocab.json`
- Runtime: ONNX Runtime Web, client-side, 16 kHz mono, 80-channel log-mel input

The repository's real-audio gate currently covers 13 cases: hold-out voices,
run-on recitation, a partial-ayah start, a long ayah, a repeated refrain, a
non-recitation intro retry, and deterministic phone-band/background-audio
stress. These cases validate the complete transcript, Quran-range, and boundary
pipeline, not just model transcription.

## Current candidate

The maintained `Muno459/fastconformer-quran` model card reports a June 2026
weight refresh focused on real-phone audio and publishes compatible-looking
CTC ONNX exports with a 1,025-class tokenizer:

- <https://huggingface.co/Muno459/fastconformer-quran>
- <https://huggingface.co/Muno459/fastconformer-quran/blob/main/README.md>

Its model card reports a 4.13% overall WER on a 600-clip leakage-free benchmark
and explicitly warns that the public EveryAyah test split overlaps training data.
Those are self-reported results, so they are useful evidence for evaluation, not
enough evidence for an automatic production replacement.

The current repository release predates that refresh. The refreshed weights are
gated, and access requires accepting the model's terms. AyahClip must not bypass
that gate through an unofficial mirror.

## Replacement gate

A new model can replace `asr-model-v1` only after all of these pass:

1. Record the source commit, accepted license, tokenizer digest, ONNX input/output
   names, quantization method, size, and SHA-256.
2. Confirm the 1,025-token mapping is byte-for-byte compatible, or version the
   vocabulary and IndexedDB cache key with the new model.
3. Run the current 13-case alignment matrix without regression.
4. Add licensed, unseen real-handset clips with room echo, background speech,
   compression, and reciters absent from model training.
5. Compare Quran-range accuracy, internal-cut mean/max error, peak browser memory,
   model download size, warm-cache load time, and cancellation latency.
6. Ship behind a versioned model URL so cached old weights cannot be paired with
   a new tokenizer.

Until that evidence exists, AyahClip improves the reliable part of the system:
candidate retrieval, explicit ambiguity handling, hybrid CTC/transcript/pause
alignment, per-boundary review markers, and reversible manual correction.

## Licensed handset benchmark onboarding

`Quran-Lab/quranic-asr-benchmark` is a manually gated dataset that includes a
real-phone `tlog_holdout` split. Access must be requested from its Hugging Face
page and used under the displayed upstream Tarteel tlog, EveryAyah, and QUL
terms. Do not commit, redistribute, or upload its audio to this repository.

After lawful access is granted, keep the downloaded files outside the repository
and run either the directory convention (`surah_ayah_...`) or a JSONL manifest:

```sh
npm run benchmark:recognition-corpus -- /absolute/private/path/tlog_holdout \
  --min-cases 30 \
  --min-candidate-recall 0.95 \
  --min-auto-precision 1 \
  --max-false-auto 0 \
  --require-tags phone,room-echo,compression,background-speech,unseen-reciter \
  --min-cases-per-tag 5 \
  --min-tag-candidate-recall 0.90 \
  --max-tag-false-auto 0 \
  --require-license-metadata
```

The evaluator reports exact-range accuracy, creator-visible top-three recall,
deeper candidate-set recall, auto-apply precision, false auto-applies, and
character error rate, both overall and for each required stressor tag. Manifest
rows can record `tags`, `license`, `reciter`, and `device`; these fields keep a
good aggregate score from disguising missing handset or mixed-speech coverage.
Repeated short verses are genuinely underdetermined from isolated audio, so the
release gate prioritizes zero false auto-applies and safe creator review over
forcing an exact first guess.
