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

Import a video or recitation you own, shape it for a 9:16 canvas, and pair Arabic ayat with an English translation. Choose a centered, side-fade, or lower-third layout; refine each verse on the timeline; preview the result; then export a clean MP4 ready to share.

Built for calm, deliberate editing:

- Uthmanic Arabic typography with English translations
- Verse-by-verse timing controls
- Distraction-free full-screen 9:16 preview
- Centered, side-fade, and lower-third layouts
- Soft glow, crisp outline, gold, and clean caption styles
- Local Photos and Files import
- Share Sheet import for original media and reference links
- On-device project storage, video export, and explicit Save to Photos
- No account required

AyahClip does not download other creators’ posts. TikTok, Instagram, and YouTube links are saved only as references while you locate the source file. For a video you own or have permission to reuse, the on-device Clean a watermark tool can blur the two common moving TikTok watermark zones before editing.

## Keywords

quran,recitation,video editor,ayah,arabic,captions,islamic,shorts,reels,vertical video

## TestFlight — What to Test

Please test the build 3 mobile-parity checkpoint:

1. Complete the three-screen onboarding flow.
2. Tap **New Quran clip** and confirm the shared AyahClip Studio opens and closes without losing the project.
3. Import owned photos, video, and audio from the native Photos and Files pickers inside Studio.
4. Choose and correct a Quran passage, then edit Arabic and English captions and timing.
5. Switch templates, caption treatments, and B-roll while checking the 9:16 preview stays fitted.
6. Export the MP4 and verify the native Photos/share delivery flow.
7. In **Import**, choose **Clean a watermark**, confirm ownership or permission, select an owned video, and verify the processed copy opens as a new project with audio retained.
8. Send up to eight original photos or movies to AyahClip from the iOS Share Sheet and verify they arrive in order. Also share a TikTok, Instagram, or YouTube post link and verify it is saved only as a reference.
9. Duplicate, reopen, and delete a project from the Projects screen.

Please report any mismatch between the editor preview and the exported MP4, clipped text, mistimed ayat, failed imports, or failed exports.

## Beta App Review notes

AyahClip requires no account or login.

To review the core flow, launch the app, complete onboarding, and tap **New Quran clip**. AyahClip opens the same responsive Studio used by ayahclip.com inside a native, origin-locked editor host. Photos and Files selections are copied into private app storage and exposed to the Studio through temporary opaque handles. Use the Studio controls to confirm the Quran range, adjust captions, layouts, timing, and B-roll, then export and deliver the completed MP4 through the native Photos/share flow.

The Share extension is named **Import to AyahClip**. It accepts up to eight original movies, or one web URL or text item containing a supported TikTok, Instagram, or YouTube link. Caption text wrapped around a supported link is accepted because platform share sheets commonly deliver that shape. Original movies are copied in order into the private App Group inbox after the same 4 GB per-clip, eight-clip, and free-storage checks used by the editor. Supported URLs are normalized, stripped of fragments, checked against exact platform-domain boundaries, and stored only as references. The main app consumes the inbox when it becomes active.

The beta intentionally does not download content from TikTok, Instagram, or YouTube. Watermark cleanup only accepts an existing file selected by the user, runs on device, and requires the user to confirm ownership or permission. This protects creator rights and avoids third-party media downloading.

## App privacy answers

- Data collection: **No data collected**
- Tracking: **No**
- Account creation: **Not supported**
- User-generated content upload: **No server upload**
- Processing: **On device**

## Current beta scope

Version 0.1.0 is an iPhone portrait beta. Build 4 mounts the complete ayahclip.com product in the native app, including Quran browsing, reciter and imported-media journeys, project library, templates, Studio, timeline, B-roll, captions, and native export. Recognition results still require creator confirmation and physical-device quality testing; they must not be treated as authoritative Quran text without review.

## Latest internal TestFlight build

- **Version/build:** 0.1.0 (4)
- **Uploaded:** 18 July 2026
- **App Store Connect state:** Upload accepted; Apple processing
- **Internal group:** AyahClip Internal (1 tester, iPhone 14 Pro)
- **Main bundle ID:** `app.ayahclip.mobile`
- **Share extension bundle ID:** `app.ayahclip.mobile.share`
- **Signing:** Apple Distribution with dedicated App Store profiles for both executables
- **Validation:** Focused unit and UI suites for product navigation, real media import, bridge/export, watermark processing, and identity pass; web tests, lint, TypeScript, production build, archive identity, embedded profiles, application groups, and strict code signatures are release gates

Build 4 replaces the disconnected native dashboard with the complete AyahClip web product, keeps a dedicated native MP4 export bridge, and adds permission-gated on-device watermark concealment for an existing file the tester owns or has permission to reuse. It intentionally does not download TikTok, Instagram, or YouTube posts. Physical iPhone validation of recognition, long imports, memory pressure, backgrounding, every template, watermark quality on varied footage, and export/save recovery remains required before any public-release claim.
