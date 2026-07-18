# AyahClip production performance budget

Date: 2026-07-18

## Scope

This gate measures the creator interactions that must feel immediate in the deployed web app. It uses installed Google Chrome against `https://ayahclip.vercel.app`, a 1.2-second generated WAV, Surah 51:1–2, and the Reciter Split Fade template. Telemetry is intercepted so analytics delivery cannot distort editor timings.

The test runs three fresh browser journeys sequentially. Every run must remain inside every budget; averages cannot hide a slow interaction.

| Interaction | Budget | Highest observed across three runs |
| --- | ---: | ---: |
| Import page usable | 4,000 ms | 310 ms |
| Local audio ingested and labelled Loaded | 2,000 ms | 260 ms |
| Template selection to usable Studio | 6,000 ms | 1,058 ms |
| Play control changes to Pause | 750 ms | 101 ms |
| Keyboard timeline seek updates the playhead | 500 ms | 15 ms |
| Exact MP4 preview opens with readable video metadata | 30,000 ms | 257 ms |

All 18 measured thresholds passed on 2026-07-18. The exact measurements are printed by the Playwright reporter and attached to each test result as `performance-budget.json`.

## Reproduce

```bash
npm run test:production-performance
```

The test is deliberately skipped unless both `PERFORMANCE_BUDGET=1` and `PLAYWRIGHT_BASE_URL` are present. Development-server timings are not accepted as production evidence.

## Boundaries

- The MP4 measurement proves the short-form render path and its startup overhead. It does not replace the low-memory long-export suite or prove acceptable export time for multi-minute source media.
- Results depend on network location, CDN state, browser and hardware. The budgets are release regressions, not a universal latency promise to every user.
- Recognition-model download and ASR execution have separate size, route and corpus gates because including the 131 MB model in an ordinary editor interaction budget would mix two different workflows.
- Mobile-native rendering uses AVFoundation and remains covered by the iOS export unit/UI suites rather than this browser measurement.

## Release decision

The short deployed creator journey is within budget. Long-export stress, poor-network behavior, and real-device thermal/memory testing remain separate launch gates and must not be inferred from this result.
