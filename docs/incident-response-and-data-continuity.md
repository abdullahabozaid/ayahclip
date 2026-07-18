# AyahClip incident response and data continuity

This runbook is for the account-free public product. It defines what AyahClip can recover, what remains the creator's responsibility, and how the operator responds without collecting private media.

## Data ownership and recovery boundary

AyahClip projects, imported source blobs, personal B-roll, templates, recognition results, and edit state are stored on the creator's device. They are not copied to an AyahClip cloud account and the operator cannot restore them after the creator deletes a project, clears site data, loses the device, or removes a desktop save folder.

Creators should retain:

- their original audio and video files;
- any personal B-roll source files;
- exported MP4 files they intend to publish; and
- explicit desktop save folders in their normal device backup.

Downloaded or shared files live outside AyahClip and must be deleted from their destination separately. Never imply that browser-local storage is a backup.

The recoverable service assets are different:

- source code and release history are preserved in GitHub;
- Git history and versioned container builds provide immutable rollback inputs;
- reviewed stock-media and reciter manifests preserve provenance and admission decisions; and
- scheduled reciter-source reports are retained as GitHub Actions artifacts for 30 days.

Docker runtime logs are operational telemetry, not a user-project backup. Rotation is capped by `docker-compose.production.yml`. Do not export or retain journey-level logs longer than necessary for an active investigation.

## Severity and response targets

| Severity | Example | Immediate response |
| --- | --- | --- |
| SEV-0 | Incorrect Quran text, wrong ayah-to-audio attribution, corrupted export presented as correct, or exposure of private media or a secret | Stop or hide the affected path immediately. Roll back the deployment when the fault is release-wide. Preserve privacy-safe evidence and rotate exposed credentials. |
| SEV-1 | Import or export unavailable for a major browser, security boundary failure, or sustained production outage | Confirm on a second device or network, contain the affected feature or provider, and restore the last verified deployment. |
| SEV-2 | One upstream reciter or stock provider degraded, or a partial non-destructive workflow failure | Confirm the upstream failure, hide only the affected source when necessary, and keep the rest of the product available. |

The product owner or current release operator owns incident command. One person records the timeline, scope, decisions, deployed version, and verification results. A helper may investigate, but there must be one named decision owner during the event.

## Triage and containment

1. Record the UTC start time, affected route or workflow, deployed commit, browser/device class, and fixed error category. Do not request private media, unpublished links, file names, Quran transcripts, or credentials.
2. Reproduce with a non-private fixture. Check the production smoke, Google Chrome readiness, security-boundary, and reciter-source gates that match the symptom.
3. Decide whether the fault is release-wide, browser-specific, or an upstream provider failure.
4. For a release-wide fault, deploy the last verified git revision using the same recorded environment and container recipe. For an isolated provider fault, disable or hide only that provider or recording; never silently substitute a different reciter.
5. For suspected secret exposure, revoke and rotate the credential, review VPS and environment-file access, and redeploy before restoring the feature.
6. Verify the repaired path in production with the same regression test and a fresh browser session. Quran text/audio incidents also require a human verse-reference check before reopening.

Do not debug by asking a creator to upload their project. The `/diagnostics` report is local and contains only coarse environment and capability information; the creator must review it before deliberately posting it through the public support form.

## Rollback procedure

1. Identify the most recent production deployment that passed the release gates in [`launch-operations.md`](./launch-operations.md).
2. Check out that exact git revision on the VPS and rebuild with the same recorded environment values; do not mix an old source revision with newly changed dependencies or configuration.
3. Confirm `/`, `/import`, `/studio`, `/privacy`, and `/support` load over HTTPS with the expected security headers.
4. Run the deployed production smoke and one exact MP4 render in installed Google Chrome.
5. Record the failed and restored deployment IDs and open a regression issue before resuming feature work.

A rollback restores the service code; it cannot reconstruct a creator's deleted browser-local data.

## Communication and closure

Use the public GitHub support issue for reproducible non-sensitive reports. If a report contains personal information, private URLs, credentials, or unpublished content, remove it from public view as soon as possible and continue without copying that content into the incident record.

Before closing an incident:

- add or strengthen the regression test;
- verify the fix against production;
- document the root cause and the smallest prevention measure;
- confirm any temporary provider disablement is still visible in the source manifest; and
- rotate secrets again if their handling remains uncertain.

Run a rollback and restore drill before broad launch and at least quarterly afterward. The drill must prove a previous verified revision can be deployed through the VPS container workflow and that the production smoke, security headers, reciter-source health, and exact MP4 export recover. It must not use or copy a real creator project.

## Future accounts and administration

Do not add accounts, cloud projects, CRM records, or an admin console piecemeal. Authentication, tenant isolation, role checks, audit logs, data export, account deletion, retention limits, backup encryption, restore testing, and incident ownership must ship as one reviewed system. A creator's deletion request must cover every account-linked copy, including backups according to a published expiry schedule.
