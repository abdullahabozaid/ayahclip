# AyahClip public beta field test

Use this protocol to prove the two release gates that browser automation cannot prove:

1. a real export works on current physical phone hardware; and
2. an ordinary creator can finish the first clip without developer assistance.

Do not count the maintainer, a contributor, or anyone who has already seen the editor as an ordinary first-time creator.

## Before each session

- Open `https://ayahclip.vercel.app` in a private/incognito window so the first-run journey is clean.
- Use media the tester owns or has permission to use. Never use gated benchmark recordings.
- Ask the tester to share their screen only. Do not ask them to share the source file.
- Do not explain AyahClip's navigation, recognition, timeline, templates, or export controls.
- Start a timer when the homepage appears.

Give the tester only this task:

> Make a vertical Quran recitation clip from this media. Confirm the correct ayahs, choose a visual style, preview the result, save it, and play the saved video.

If the tester asks a question, answer only: “Please do what you would normally try.” If they cannot continue, record the point of failure before helping. A session that receives help is not an unassisted completion.

## Observe without leading

Record whether the tester can:

- find Import without prompting;
- select an audio or video file;
- understand that recognition is local and may take time;
- inspect and correct the detected surah and ayah range;
- understand why range confirmation is required;
- choose a template;
- understand the timeline and current ayah;
- preview the rendered result;
- save the video;
- find and play the saved file;
- answer the in-product “without help” question honestly.

Also record every pause longer than ten seconds, backtrack, accidental action, unclear label, and error message. Do not turn observations into instructions during the session.

## Physical-device matrix

Complete at least one full session in each row. Use a 3–5 minute source for the low-memory computer row and at least a 30-second source for phones.

| Gate | Required environment | Required result |
| --- | --- | --- |
| iPhone | Physical iPhone, current iOS, Safari | Final preview plays with audio; Save Video or download succeeds; saved file plays outside AyahClip |
| Android | Physical Android phone, current Android, Chrome | Final preview plays with audio; download succeeds; saved file plays outside AyahClip |
| Lower-memory computer | 8 GB RAM or less, current Chrome, no other heavy apps | A 3–5 minute source imports, edits, exports, downloads, and plays without a tab crash |

For each device, record:

```text
Date/time:
Device model:
OS version:
Browser and version:
Available memory (if known):
Source container and duration:
Output container and duration:
Import result:
Recognition result:
Preview result:
Save/download result:
Playback outside AyahClip:
Elapsed time:
Any error text:
Diagnostics copied voluntarily (if needed):
Pass / fail:
```

## Ordinary-creator sample

Run at least ten first-time sessions across a mixture of Quran content creators and people who edit short-form video but have never used AyahClip.

The controlled public-beta gate passes when:

- at least 8 of 10 testers reach a saved, playable video without assistance;
- at least 9 of 10 correctly confirm or correct the Quran range before export;
- no tester accidentally publishes or loses their source media;
- median completion time is 10 minutes or less for a short source;
- export succeeds in at least 9 of 10 sessions;
- every physical-device row above passes;
- there is no repeated severity-one issue: incorrect Quran text/range after confirmation, privacy breach, corrupted output, or unrecoverable data loss.

Do not average away a Quran-integrity or privacy failure. Any such failure blocks broad launch until reproduced, fixed, and retested.

## Result sheet

Use one row per tester. Use anonymous labels; do not record names, email addresses, filenames, source URLs, Quran text, or transcripts.

| Tester | Creator type | Device gate | Imported | Range confirmed/corrected | Template chosen | Previewed | Saved and played | Without help | Minutes | Main friction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Quran / short-form / other | iPhone / Android / computer |  |  |  |  |  |  |  |  |

Calculate:

- unassisted completion = `without-help saved videos / all sessions`;
- export success = `successful saved videos / export attempts`;
- range safety = `correctly confirmed or corrected ranges / all sessions`;
- median completion time from the successful unassisted sessions.

Compare the sheet with privacy-safe `journey_feedback`, `export_succeeded`, and `export_failed` runtime events. The human observation sheet is authoritative for assistance and saved-file playback; telemetry is supporting evidence only.

## Bug handoff

For any failure, capture:

1. the device and browser versions;
2. the exact last successful step;
3. the visible error text;
4. whether retrying worked;
5. the local `/diagnostics` report only if the tester deliberately copies it; and
6. a screenshot or screen recording with private media and notifications hidden.

Never upload the tester's media, file name, detected transcript, Quran text selection, or raw browser storage with a bug report.
