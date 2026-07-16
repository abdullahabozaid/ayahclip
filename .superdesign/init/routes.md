# Routes

- `/`: product landing page.
- `/browse`: browse Quran content and start a new clip.
- `/surah/[id]`: select verses from a surah.
- `/import`: import owned/permitted audio or video, extract audio locally, detect verses, and optionally keep the uploaded video as background.
- `/library`: saved local projects.
- `/styles`: existing route for the reusable visual-style creator. Target product label is **Templates** / **Template Studio** while retaining the URL for compatibility.
- `/studio`: full editing workspace with preview, panels, and timeline.
- `/support` and `/support/thanks`: support flow.

The requested redesign primarily changes `/styles`, its navigation label, and its handoff into `/studio`. The import flow should clarify “keep the audio, replace the visuals” without adding a third-party YouTube downloader.
