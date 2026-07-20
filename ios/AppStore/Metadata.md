# AyahClip — App Store Connect metadata

## Listing

- **Name:** AyahClip
- **Subtitle:** Quran clips, made calmly
- **Category:** Photo & Video
- **Secondary category:** Lifestyle
- **Age rating:** 4+
- **Privacy policy:** https://ayahclip.com/privacy
- **Support:** https://ayahclip.com/support
- **Marketing:** https://ayahclip.com

## Promotional text

Create considered vertical Quran recitation clips with precise ayah timing, luminous typography, and clean exports—privately on your iPhone.

## Description

AyahClip is a focused editor for creating beautiful vertical Quran recitation videos.

Import a video or recitation you own—or paste a supported public YouTube, TikTok, or Instagram link you have permission to reuse—shape it for a 9:16 canvas, and pair Arabic ayat with an English translation. Choose a centered, side-fade, or lower-third layout; refine each verse on the timeline; preview the result; then export a clean MP4 ready to share.

Built for calm, deliberate editing:

- Uthmanic Arabic typography with English translations
- Verse-by-verse timing controls
- Distraction-free full-screen 9:16 preview
- Centered, side-fade, and lower-third layouts
- Soft glow, crisp outline, gold, and clean caption styles
- Local Photos and Files import
- Share Sheet import for original media and supported public post links
- On-device project storage, video export, and explicit Save to Photos
- No account required

AyahClip can resolve a supported public YouTube, TikTok, or Instagram link to the platform's available source for content you own or have permission to reuse. It does not bypass private-account access, DRM, or platform permissions. For an existing owned video file, the on-device Clean a watermark tool can also obscure common moving watermark zones before editing.

## Keywords

quran,recitation,video editor,ayah,arabic,captions,islamic,shorts,reels,vertical video

## TestFlight — What to Test

Please test the build 7 automated-import release candidate:

1. Complete the three-screen onboarding flow.
2. Tap **New Quran clip** and confirm the shared AyahClip Studio opens and closes without losing the project.
3. Import owned photos, video, and audio from the native Photos and Files pickers inside Studio.
4. Choose and correct a Quran passage, then edit Arabic and English captions and timing.
5. Switch templates, caption treatments, and B-roll while checking the 9:16 preview stays fitted.
6. Export the MP4 and verify the native Photos/share delivery flow.
7. Paste a supported public YouTube, TikTok, or Instagram link you own or may reuse. Compare Fast and HD import, confirm the selected segment is correct, and verify recognition starts automatically. Repeat a TikTok or Instagram link from the iOS Share Sheet.
8. In **Import**, choose **Clean a watermark**, confirm ownership or permission, select an owned video, and verify the processed copy opens as a new project with audio retained.
9. Send up to eight original photos or movies to AyahClip from the iOS Share Sheet and verify they arrive in order.
10. Duplicate, reopen, and delete a project from the Projects screen.

Please report any mismatch between the editor preview and the exported MP4, clipped text, mistimed ayat, failed imports, or failed exports.

## Beta App Review notes

AyahClip requires no account or login.

To review the core flow, launch the app, complete onboarding, and tap **New Quran clip**. AyahClip opens the same responsive Studio used by ayahclip.com inside a native, origin-locked editor host. Photos and Files selections are copied into private app storage and exposed to the Studio through temporary opaque handles. Use the Studio controls to confirm the Quran range, adjust captions, layouts, timing, and B-roll, then export and deliver the completed MP4 through the native Photos/share flow.

The Share extension is named **Import to AyahClip**. It accepts up to eight original movies, or one web URL or text item containing a supported TikTok or Instagram link. Caption text wrapped around a supported link is accepted because platform share sheets commonly deliver that shape. Original movies are copied in order into the private App Group inbox after the same 4 GB per-clip, eight-clip, and free-storage checks used by the editor. Supported URLs are normalized, stripped of fragments, checked against exact platform-domain boundaries, and handed to the main app when it becomes active.

For supported public YouTube, TikTok, and Instagram links, AyahClip's server uses the platform's available playback source and returns a selected MP4 segment to the editor. It does not access private posts or bypass DRM. The creator must own the content or have permission to reuse it. Existing-file watermark cleanup runs on device and requires the same ownership or permission confirmation.

## App privacy answers

- Data collection: **No data collected**
- Tracking: **No**
- Account creation: **Not supported**
- User-generated content upload: **Local files are not uploaded; a pasted public post URL is sent transiently for source resolution**
- Processing: **Editing, recognition, projects, and export run on device; public-link source resolution runs on the AyahClip VPS**

## Current beta scope

Version 0.1.0 is an iPhone portrait beta. Build 7 mounts the complete ayahclip.com product in the native app, including Quran browsing, reciter and imported-media journeys, project library, templates, Studio, timeline, B-roll, captions, source-link import, and native export. Recognition results still require creator confirmation and physical-device quality testing; they must not be treated as authoritative Quran text without review.

## Latest internal TestFlight build

- **Version/build:** 0.1.0 (7)
- **Uploaded:** 19 July 2026
- **App Store Connect state:** Uploaded; Apple processing for AyahClip Internal
- **Internal group:** AyahClip Internal (1 tester, iPhone 14 Pro)
- **Main bundle ID:** `app.ayahclip.mobile`
- **Share extension bundle ID:** `app.ayahclip.mobile.share`
- **Signing:** Apple Distribution with dedicated App Store profiles for both executables
- **Validation:** Focused unit and UI suites for product navigation, real media import, bridge/export, watermark processing, and identity pass; web tests, lint, TypeScript, production build, archive identity, embedded profiles, application groups, and strict code signatures are release gates

Build 7 adds fast segmented YouTube import with an optional HD path, automatic recognition after import, partial-ayah edge handling, exact one-to-four-ayah grouping, whole-passage grouping, and consistent 24 px Arabic / 12 px translation defaults. It retains the complete mobile-parity editor, public TikTok and Instagram source import, and on-device watermark cleanup from build 6. The live production revision passed the Google, security, accessibility, phone-layout, exact-MP4, recognition, and real-audio alignment gates before this upload. Physical iPhone validation of recognition, long imports, memory pressure, backgrounding, every template, link availability, and export/save recovery remains required before any public-release claim.
