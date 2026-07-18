# AyahClip native product parity audit

Date: 2026-07-18

## Release decision

The uploaded iPhone build is an internal prototype, not a market-ready mobile
release. It must not move to external TestFlight or App Review until the parity
gates below pass on a physical iPhone.

## 2026-07-18 hands-on continuation finding

The product-parity integration blocker is resolved locally. `RootView` now
presents the retained `MobileEditorHostView` and the legacy prototype editor is
not mounted. The native host loads the shared AyahClip Studio, keeps its WebKit
session alive for the edit, and connects Photos/Files selection, project
checkpoints, private media handles and exported-file delivery to the tested
bridge contracts.

Build 3 also adds a rights-safe on-device **Clean a watermark** workflow for an
existing video the creator owns or has permission to reuse. The first version
blurs TikTok's common moving top-left and bottom-right watermark zones, retains
audio, and imports the processed MP4 as a new project. It does not fetch or
download posts from social platforms.

This removes the main code-path gap, but it is not a public-readiness claim. A
new TestFlight build still needs the following journeys run end to end on a
physical iPhone:

1. New clip, manual Quran selection, reciter selection, edit, save, close and
   reopen.
2. Photos video import, Photos still-image import, Files audio import, local
   recognition, ambiguous-range review and manual range correction.
3. Apply each built-in template, add and reorder B-roll, edit Arabic and English
   caption treatment, and verify the 9:16 preview remains correctly fitted.
4. Export MP4, transfer it through the native bridge, save to Photos, cancel an
   export, and retry a failed Photos save without losing the completed file.
5. Share media into AyahClip, relaunch, confirm inbox delivery order, and verify
   ScanAuctions remains a separately installed bundle.

The design gate for the replacement host is recorded in Superdesign project
`521fa828-42fe-47f5-939a-744c61d2aa87`. The current-state reproduction is draft
`b5541493-a8e5-4d5c-ac80-fe929e6782e6`; the clean mobile Studio direction is
draft `5a228763-63d1-4e50-a365-5369edae8eba`. Implementation must preserve the
shared Studio as the source of editing functionality and keep the native shell
limited to lifecycle, loading/recovery, Photos/Files selection and export
delivery.

Current evidence after regenerating the Xcode project:

- Web: 63 test files / 345 tests pass; ESLint, TypeScript and the optimized
  Next.js production build pass.
- Native signed simulator: 73 unit tests pass.
- The host-session unit test now constructs the real `WKWebView`, verifies the
  retained single-view lifecycle, navigation delegate, custom user agent,
  private media scheme handler and `/import` request. It still does not prove a
  production Studio page completed hydration, so a mounted UI/device journey
  remains mandatory.
- Native shell: 4 end-to-end UI journeys pass, including onboarding, opening
  and closing the mounted shared Studio, the owned-media watermark entry flow,
  and legal/settings links. The real video picker still requires a physical
  Photos library test.
- Unsigned simulator runs correctly fail the two App Group inbox tests because
  the test host has no App Group entitlement. Native parity claims must use the
  signed simulator/device path and report that distinction explicitly.
- Live mobile web inspection confirms `/import` exposes local owned-media
  upload, all 114 surahs, recognition, manual range correction and explicit
  confirmation. These controls are absent from the current TestFlight shell
  solely because the shared host is not presented.

## Foundation progress on the current branch

The following work is implemented locally but is not in TestFlight build 1:

- Photos and Files accept owned still images as well as video and audio.
- The Share Extension now requests a provider-backed file representation before
  copying shared media, so Photos images delivered as objects/data are accepted
  rather than requiring the source app to return a file URL.
- Still images persist with editable source duration and are converted into the
  same vertical preview/export timeline, including photo plus recitation audio.
- The Share Extension declares and accepts still-image input.
- The native project model can load the same Quran.com chapter and verse source
  used by the web app and apply a creator-chosen contiguous range without
  retaining the hard-coded starter verses.
- The first versioned web/native editor contract is present on both sides. It
  locks production navigation to the AyahClip Studio origin and carries typed
  detection review state instead of arbitrary JavaScript messages.
- Native media is exposed to the shared editor only through random opaque
  `ayahclip-media` handles. The scheme handler validates the Studio origin,
  private storage roots, media types and byte ranges, streams in bounded chunks,
  and revokes every handle when its editor session closes.
- Native and web now share a validated version-1 project snapshot containing
  Quran selection, verse timing, stable style IDs and opaque media descriptors.
  A session owns hydration, applies validated web edits back to the native
  project without permitting web-side media replacement, and rolls back all
  handles if preparation fails.
- The browser bridge now performs a typed `ready`/`hydrateProject` exchange via
  the iOS WebKit reply handler and can return validated `projectChanged`
  envelopes. Ordinary browser Studio sessions never activate this path.
- The native WebKit message endpoint accepts only the AyahClip Studio main
  frame, enforces a 2 MiB message ceiling, decodes supported typed messages and
  rejects arbitrary or incompatible messages before they reach project state.
- A versioned durable editor document now preserves the full web project rather
  than reducing it to native summary styles. Temporary WebKit media handles are
  rewritten to stable ordered media-slot references before storage and resolved
  to fresh opaque handles whenever the project reopens.
- Native Studio hydration now restores verified Quran verses, selected timing,
  imported audio/video, B-roll, summary styling and the durable web project when
  `/studio` is opened through the versioned iOS bridge. Regular browser Studio
  sessions do not enter the native hydration path.
- Unknown-passage recognition is now one shared local pipeline rather than
  import-page-only logic. Browser imports and the forthcoming native Studio
  entry point use the same retry selection, Quran matching, ambiguity review,
  forced alignment and pause fallback behavior.
- Native projects without a confirmed passage now route into that shared import
  workflow, hydrate their opaque on-device recitation source automatically, and
  send the creator-confirmed Quran range and aligned boundaries back to the
  native project before entering Studio. Placeholder verses are no longer the
  required bridge into recognition.
- Studio saves now send validated project checkpoints back to the active native
  project while retaining the complete editor document. Native media ownership
  and source attribution remain native-controlled during the round trip.
- A retained editor environment installs the origin-locked message channel and
  opaque media scheme handler on one WebKit configuration, prepares hydration,
  creates the runnable shared-editor web view, confines top-level navigation to
  AyahClip Studio, and revokes every session media handle when the editor closes.
- Finished shared-Studio videos now have a bounded local export channel: WebKit
  sends ordered 512 KiB chunks, native validates type, size, count and byte
  order, reconstructs the exact file on device, moves it out of bridge storage,
  and completes the explicit Photos permission/save path. Creator video is not
  uploaded to an AyahClip server for native delivery.
- Media controls inside the shared Studio can now request owned images, video or
  audio from the native picker contract. AppModel copies each accepted item into
  private storage, the active editor session adds scoped opaque handles without
  invalidating the original recitation, and the web snapshot immediately merges
  those descriptors so B-roll survives autosave and reopening.
- A main-actor native picker coordinator now bridges those async Studio
  requests to the future SwiftUI host. It allows one system picker at a time,
  derives the requested image/video/audio content types, validates result count
  and type, and resumes every WebKit continuation exactly once on completion,
  cancellation or teardown.
- Studio media purpose is now preserved across the bridge: primary intake may
  populate an empty project source, while B-roll and replacement selections are
  always attached as additional assets. A background chosen for a reciter-only
  project can no longer silently become its primary recitation source.
- Real New Clip and media-only intake now create an empty, valid draft instead
  of copying the prototype's Al-Mulk 1-3 captions. Loading build-1 storage
  removes that passage only when title, range and every caption still exactly
  match the untouched placeholder; any creator edit prevents migration. Until
  a passage is confirmed, imported audio routes to `/import` and the legacy
  shell exposes no fabricated split/timing controls.
- One native host-session owner now retains the WebKit environment and system
  picker coordinator together, returns only one web view, and closes loading,
  bridge handles and any awaiting picker exactly once. The approved SwiftUI
  presentation can therefore mount this tested session without rebuilding
  lifecycle logic in the view layer.
- Projects that begin without source media authorize only AyahClip's private
  media directory for later picker results. The confined native Studio also
  hides the browser-only Template Studio link instead of offering navigation
  that the native origin policy must reject; all six built-in compositions
  remain directly selectable in Studio.
- Archive identity verification rejects an unexpected display name or bundle
  identifier before upload.

These are implementation milestones, not a completion claim. Physical
recognition execution, complete save/reopen/export journeys, watermark output
review on varied real videos, and full physical-device verification remain
required.

Current automated baseline: 73 native unit tests, 4 native UI journeys and 345 web
tests pass; web lint, TypeScript and the optimized production build also pass.

App Store Connect keeps the products isolated:

- AyahClip: app record `6792317617`, bundle ID `app.ayahclip.mobile`, version
  `0.1.0` build `1`.
- ScanAuctions: app record `6780227595`, bundle ID `com.scanauctions.app`, version
  `1.0` build `3`, uploaded 2026-06-15.

The AyahClip archive and Apple upload record both identify
`app.ayahclip.mobile`. The ScanAuctions binary metadata still identifies
`com.scanauctions.app`. A physical-device launch that shows the wrong product is
therefore a launch-blocking installation or icon-selection issue, not evidence
that Apple replaced the ScanAuctions binary. Reproduce it from the TestFlight
app while recording the selected product name, version, build, and home-screen
icon before changing either app record.

Every future AyahClip archive must pass
`ios/scripts/verify-archive-identity.sh` before upload. The gate reads the
embedded application instead of trusting the selected Xcode target, verifies
the requested version and build plus the bundled AyahClip Share extension, and
rejects any artifact whose display name or bundle identifier does not match
AyahClip. Its fixture test also proves that ScanAuctions metadata and a wrong
build number fail closed.

The Mac currently has valid Apple Development and Apple Distribution identities
for team `PUV357QJL4`, but its five installed provisioning profiles cover other
products and not `app.ayahclip.mobile`. Signing into Xcode has therefore not yet
produced local evidence that a replacement AyahClip archive can be signed. The
separate ScanAuctions source tree still builds as `ScanAuctions`, bundle
`com.scanauctions.app`, version `1.0` build `4`; no AyahClip identifier appears
in that native target.

## Current gap matrix

| Capability | Web product | Native build 1 | Required mobile behaviour |
| --- | --- | --- | --- |
| New clip | Reciter or imported-media path | Immediately creates hard-coded Al-Mulk 1–3 | Present the two real starting paths before creating a project |
| Quran selection | All 114 surahs, verse picker, range selection | No picker | Browse, search, preview, select and edit the ayah range |
| Reciters | Catalog and verse audio | None | Choose and preview a supported reciter before Studio |
| Photos import | Video plus image backgrounds/B-roll | `PhotosPicker` is `.videos` only | Import owned video, audio where supported, and still images |
| Files import | Audio and video | Exists only in a separate Import tab | Make Files available inside New Clip and Media tools |
| Imported clip | Decode, keep video or replace visuals | Import path exists but is disconnected from New Clip | Show copy/decode progress, recovery, and the resulting project |
| Passage recognition | On-device Prepare, Listen, Match, Align | Missing | Run local recognition, show honest progress, alternatives and cancellation |
| Manual correction | Surah/from/to controls and explicit confirmation | Missing | Always allow correction and require range confirmation |
| Templates | Curated gallery, saved templates and full compositions | Three layouts and four caption effects | Use the same template families and saved-template contract |
| Quran typography | Verified font modes, real weights and mark checks | One bundled Uthmanic face | Offer only verified modes and keep preview/export identical |
| Timeline | Waveform, pause rebuild, recitation alignment, confidence review, word trim and splits | Basic segment strip and boundary buttons | Port the complete mobile timeline interaction |
| Media composition | Images/video, B-roll sequence, fit, crop, zoom, focal position and split mask | Video sequence only | Support stills and video with direct and numeric placement controls |
| Preview/export parity | Shared canvas renderer | SwiftUI preview and separate Core Animation exporter | One rendering contract and pixel-parity tests |
| Project continuity | IndexedDB project and template persistence | Separate SwiftData-like JSON store | One explicit handoff/sync contract; never silently fork a project |
| Native delivery | Browser download | Save to Photos and Share Sheet exist | Retain these native bridges and surface clear permission recovery |
| Shared intake | Browser picker | Share extension accepts owned movies and link references | Keep ordered intake, add supported still images, show pending imports |
| Social links | Reference only | Reference only | Preserve attribution; use official owner-authorized access only |

## Corrected information architecture

1. **Projects**: recent projects, clear status, New Clip.
2. **New Clip**:
   - Choose Quran verses.
   - Import my media.
3. **Verse path**: Surah browser, ayah picker, reciter, template, Studio.
4. **Import path**: Photos/Files, original-versus-replace choice, recognition,
   range review, template, Studio.
5. **Studio**: preview, transport, timeline, Text, Media, Templates, Adjust,
   Export.
6. **Templates**: the same curated and saved compositions as the web product.
7. **Settings**: privacy, storage, diagnostics, legal links and build identity.

Import must not remain a top-level tab that creators have to visit after an
empty project is already open.

## Architecture decision needed before implementation

The current SwiftUI prototype duplicates the mature browser editor and has
already drifted. The recommended route is a hybrid product shell:

- keep SwiftUI for Projects, New Clip, Photos/Files, Share Extension, permission
  recovery, Save to Photos and the system Share Sheet;
- host the shared creator flow and renderer in an authenticated, origin-locked
  `WKWebView` surface served by `ayahclip.com`;
- bridge only typed project/media/export messages, never arbitrary JavaScript;
- keep imported media on device and transfer it through scoped native bridge
  endpoints rather than uploading private source files;
- version the bridge contract and refuse incompatible web/native versions with
  a recoverable update screen.

This produces one editor and one rendering contract. A full native rewrite is
possible, but it requires separate ports of Quran data, recognition/ONNX,
alignment, template state, canvas composition, export, persistence, and every
regression test. It should be chosen only if maintaining two engines is an
intentional long-term commitment.

The bridge snapshot remains a native-readable summary, while the versioned web
project document is authoritative for template, font, emphasis, mask,
transform, sequence and animation settings. This prevents the prototype Swift
model from flattening creator work. The remaining TestFlight blocker is wiring
that contract into the approved shared Studio host and proving save/reopen and
export on physical devices.

## Rights-safe media policy

AyahClip can import originals a creator owns, accept platform-supported access
to that creator's own media, and preserve a post URL as attribution/reference.
It must not remove watermarks, bypass platform download controls, or strip
creator attribution from third-party posts. If a platform supplies an official
download that retains its watermark, AyahClip may import that file unchanged.

## TestFlight gates

- The selected TestFlight product, home-screen icon, display name, bundle ID,
  version and build are verified before launch.
- New Clip never creates a hard-coded Quran range.
- Both start paths reach Studio without visiting an unrelated tab.
- All 114 surahs and valid ayah ranges are selectable.
- Owned video, audio and still images import from Photos/Files with permission,
  cancellation, low-storage and unsupported-format recovery.
- Recognition success, ambiguity, failure and cancellation all preserve manual
  range controls.
- Every curated template opens, previews, edits, saves and exports.
- Preview and exported frames match for Arabic marks, line breaks, placement,
  media crop, masks and timeline boundaries.
- Physical-device tests cover a short video, long video, audio-only recitation,
  portrait still, landscape still, mixed B-roll sequence and Share Extension.
- No external TestFlight group is enabled until all launch-blocking gates pass.
