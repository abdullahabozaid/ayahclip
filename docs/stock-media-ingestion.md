# Curated stock-media admission

AyahClip does not expose arbitrary stock search. The public picker contains only media that has been traced to its exact Pexels source, reviewed for visible people, and checked against browser delivery limits.

## Admission workflow

1. Record the candidate's immutable Pexels source ID and exact source page.
2. Choose a browser-appropriate rendition. Videos must remain at or below the byte ceiling in `data/stock-media-review.json`.
3. Review a photo as one complete frame. Review a video at every fraction declared by `videoSampleFractions`, including the opening and closing frames.
4. Reject the candidate if any sampled frame contains a visible person. Do not use automatic face detection as a substitute for manual review.
5. Add the runtime entry and a matching `approved` record in the review manifest. Every record needs the runtime ID, source ID, ISO review date, review method, and `peopleVisible: false` result.
6. Add rejected candidates to the manifest with a specific reason so they are not accidentally restored later.
7. Run `npm run check:stock-media`. Use `npm run check:stock-media -- --network` before publishing to probe every current thumbnail and video rendition.

The structural checker runs in CI. It fails when public media lacks review evidence, provenance changes, rejected IDs return, required subject coverage disappears, or a video exceeds the delivery ceiling. Network probes remain an explicit release check because a third-party CDN outage must not make unrelated code commits nondeterministic.
