# AyahClip future platform and growth plan

Date: 2026-07-18

This document plans the account, admin, analytics, CRM, feature-control, AI, and promotion systems requested for AyahClip. It does not authorize building them prematurely. The current public beta remains account-free and browser-local; that privacy advantage should be preserved until measured creator needs justify cloud storage.

## Product boundary today

The shipped beta has:

- browser-local projects, imported media, personal B-roll, and templates;
- privacy-safe event telemetry in Vercel Runtime Logs;
- a local authenticated operator report, not a public admin route;
- same-origin API checks, warm-instance throttles, and explicit production security headers;
- reviewed reciter and stock-media manifests;
- optional OpenAI-assisted caption framing with a reviewed editorial fallback; and
- no user accounts, contact database, cloud project store, or background media upload.

This means the operator cannot recover projects, calculate account-level retention, email creators, impersonate users, or inspect private media. Those are intentional boundaries, not missing hidden capabilities.

## Architecture decision

### Recommended future stack

Keep Next.js and Vercel as the application and function layer. When accounts become justified, use one integrated Postgres platform for authentication, relational data, private object storage, and authorization. Supabase is the preferred candidate because its Auth tokens integrate with Postgres Row Level Security, Storage supports private buckets and resumable uploads, and authentication events have an audit trail. This remains a recommendation until a proof-of-concept passes the tenant-isolation and deletion tests below.

Authoritative references:

- [Supabase Auth and JWT/RLS integration](https://supabase.com/docs/guides/auth)
- [Postgres Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs)

Use Vercel Edge Config for small, frequently read and rarely changed operational configuration such as maintenance state, provider availability, and rollout percentages. It is designed for low-latency global reads and can be changed without redeploying. Do not store creator data, secrets, entitlements, or audit history in it. See [Vercel Edge Config](https://vercel.com/docs/edge-config).

Before broad paid-API traffic, configure Vercel WAF rules. Start every rule in log mode, observe real traffic, then promote it to rate-limit, challenge, or deny. This follows Vercel's own rollout guidance and avoids blocking ordinary creators with an untested rule. See [Vercel WAF custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules).

### Do not assemble a fragmented backend

Do not add an auth vendor, unrelated document database, separate object store, CRM, analytics identity graph, and custom admin panel independently. That creates multiple deletion surfaces and makes tenant isolation difficult to prove. One account identifier, one authorization source, one retention schedule, and one deletion orchestrator are the launch requirement.

## Delivery phases and triggers

### Phase 0: account-free public beta

Stay in the current architecture while all of these are true:

- creators primarily make one-off clips on one device;
- browser-local storage loss is understood and acceptable;
- support volume is manageable without user lookup;
- aggregated journey telemetry answers product questions; and
- cloud media storage would add more privacy/cost risk than creator value.

Required work is operational: finish the controlled beta, resolve repeated usability failures, configure Search Console, complete real-device gates, and establish a green deterministic CI policy.

### Phase 1: optional accounts without cloud media

Trigger only when at least 20% of interviewed active creators ask for cross-device presets, saved favourites, or export history. Accounts must remain optional; anonymous creation continues.

Account features:

- saved preferences, favourite reciters, reusable text/layout presets;
- consent and communication preferences;
- a minimal export history containing status and timestamps, not media;
- account data export and deletion from day one; and
- MFA required for operator roles.

Do not upload source audio/video in this phase.

### Phase 2: encrypted private project sync

Trigger only after account adoption and repeated evidence that creators need cross-device project continuation. Add private object storage with resumable upload, explicit per-project sync controls, storage quotas, expiry, and a visible cloud/local indicator.

Default behaviour remains local. A creator must deliberately enable project sync. Never silently migrate existing browser blobs.

### Phase 3: teams and paid plans

Trigger after individual sync is stable and teams have been observed sharing presets or review work manually. Add workspaces, invitations, roles, shared brand/template libraries, billing, and a hosted billing portal. Use Stripe's hosted portal rather than building payment-method and subscription management from scratch. See [Stripe Billing customer portal](https://stripe.com/blog/billing-customer-portal).

## Proposed data model

Every creator-owned table includes `owner_id`, timestamps, a deletion marker only where a recovery window is explicitly promised, and an RLS policy. Tables in an exposed schema must have RLS enabled.

| Table | Purpose | Important boundary |
| --- | --- | --- |
| `profiles` | Display preferences and locale | No religious profile, inferred demographics, or social-media scraping |
| `creator_preferences` | Favourite reciters, default format, caption settings | Owner-only |
| `templates` | Reusable visual composition JSON | Media references separated from template settings |
| `projects` | Project metadata and version pointer | No source text transcript copied into analytics |
| `project_versions` | Bounded reversible edit snapshots | Retain a documented maximum count |
| `project_assets` | Private source/B-roll object metadata | Private bucket; owner-scoped path and RLS |
| `exports` | Render status, format, duration bucket | Store output only if creator opts in |
| `consent_records` | Versioned terms/privacy/marketing choices | Append-only evidence of choice |
| `communication_preferences` | Transactional and marketing topics | Withdrawal must take effect immediately |
| `subscriptions` | Stripe customer/subscription references | No card data stored by AyahClip |
| `support_cases` | Creator-submitted support metadata | No automatic media attachment |
| `operator_roles` | Owner, support, analyst, content-editor grants | Authorization stored in server-controlled app metadata |
| `operator_audit_events` | Who changed what, why, and from which state | Append-only; no private media payloads |

Object paths use `owner_id/project_id/asset_id`, not filenames. Private downloads use short-lived authenticated access. Signed URLs remain valid until expiry, so choose short expiry windows and do not treat auth-key rotation as URL revocation. See [Supabase private asset serving](https://supabase.com/docs/guides/storage/serving/downloads).

## Tenant-isolation contract

Before enabling accounts, automated tests must prove:

1. Creator A cannot list, read, update, delete, sign, or infer Creator B's rows or object paths.
2. Anonymous users cannot access authenticated project data.
3. Support roles cannot access project media unless a creator grants a time-bounded support token.
4. Analyst roles can query aggregates only.
5. Content editors can manage public reciter/media manifests but cannot access accounts.
6. Service-role credentials never reach browser code.
7. Account deletion removes primary rows, private objects, search indexes, CRM contacts, and derived analytics identifiers, then expires backup copies according to the published schedule.
8. Export produces a portable archive before deletion when requested.

Authorization must use server-controlled claims such as `app_metadata`, not user-editable metadata. Supabase explicitly warns against using editable user metadata for authorization in RLS. Operator mutations require an MFA assurance level and server-side role check.

## Admin and operator console

Do not create a public `/admin` page around client-side hiding. The future console is a separate authenticated operator surface with these roles:

| Role | Allowed actions | Explicitly forbidden |
| --- | --- | --- |
| Owner | Roles, billing configuration, emergency controls, retention policy | Viewing private media by default |
| Support | View account status and creator-submitted diagnostics; issue recovery links | Role grants, bulk exports, private project browsing |
| Content editor | Reciter availability, attribution, reviewed stock media, templates | Accounts, billing, telemetry identities |
| Analyst | Aggregated funnels and reliability metrics | Journey-level export, email addresses, media |

Every mutation records actor, role, UTC time, action, target type/ID, reason, and redacted before/after state. Destructive or broad actions require reauthentication and a second confirmation. Emergency provider switches have an automatic expiry so temporary incident settings cannot become permanent silently.

The first console modules should be:

1. service health and active deployment;
2. reciter/provider availability and scheduled health artifacts;
3. fixed error-rate metrics and export success;
4. feature/provider controls;
5. support cases deliberately submitted by creators; and
6. audit history.

Account impersonation is not included. If future support genuinely needs it, use a visibly watermarked, read-only, time-limited delegated session with creator consent and a complete audit trail.

## Feature and operational controls

Initial Edge Config keys:

| Key | Type | Purpose | Safe default |
| --- | --- | --- | --- |
| `maintenance_mode` | Boolean | Replace creation entry points with an incident notice | `false` |
| `recognition_enabled` | Boolean | Disable model loading during an incident | `true` |
| `caption_ai_enabled` | Boolean | Force reviewed editorial caption fallback | `false` until WAF/cost gate |
| `support_checkout_enabled` | Boolean | Hide checkout when Stripe is unavailable | `false` |
| `reciter_provider_state` | String/map | Hide a failing provider without silent substitution | all reviewed providers enabled |
| `minimum_web_release` | String | Operator-visible release compatibility warning | current release |

Configuration changes never alter Quran text, verse mapping, or attribution. Those remain code/data releases with review evidence. Feature flags are for availability and rollout, not sacred-content experimentation.

## Analytics and CRM boundary

### Beta analytics

Continue the current privacy-safe aggregate report. Product decisions use:

- source loaded to confirmed range conversion;
- confirmed range to Studio conversion;
- first successful preview and download;
- export failure category;
- time to first successful export;
- unassisted completion from field testing;
- coarse device/browser/source mix; and
- reciter/provider availability.

Do not optimize for raw page views, number of generated captions, or minutes spent editing. Those can reward friction rather than creator success.

### CRM trigger and consent

Do not create CRM contacts from telemetry or anonymous browser sessions. Add a contact only after a creator submits an email for a clearly named purpose. Keep transactional messages separate from marketing topics.

Resend is a suitable future email/CRM-lite candidate because contacts, internal segments, and user-facing topics are distinct, and broadcast unsubscribe flows are built in. Use Topics for creator-visible preferences and Segments only for internal organization. See [Resend Audience concepts](https://resend.com/docs/dashboard/audiences/introduction) and [transactional versus marketing email](https://resend.com/docs/knowledge-base/what-sending-feature-to-use).

Proposed topics:

- account and security (transactional, cannot be disabled where legally/operationally required);
- project/export status (transactional, user-triggered);
- product updates (optional marketing);
- creator education (optional marketing); and
- research/beta invitations (optional marketing).

No abandoned-export emails, guilt language, verse-based targeting, or inferred religiosity. A marketing unsubscribe or topic change must sync back to AyahClip's consent record.

## AI integration contract

The current caption endpoint uses the Responses API, a strict JSON schema, `store: false`, bounded output, server-only credentials, rate limiting, and a reviewed local fallback. The current cost-sensitive default `gpt-5.6-luna` matches OpenAI's current model positioning for high-volume cost-sensitive work; the model catalog states that current GPT-5.6 models support the Responses API and structured outputs. See [OpenAI model guidance](https://developers.openai.com/api/docs/models).

Allowed model tasks:

- write short intro/closing framing around an exact separately inserted translation and reference;
- classify fixed, non-sensitive client error categories from operator-authored examples;
- suggest template metadata or search tags for human review; and
- inspect generated artwork for obvious eyes/faces/text/watermarks as an additional review signal, never final approval.

Forbidden model tasks:

- generate, correct, paraphrase, translate, or complete Quran text;
- produce tafsir, rulings, promises, or claims attributed to Allah;
- silently choose the Quran range or override creator confirmation;
- voice-clone a reciter or train TTS from recitation data;
- train on gated benchmark audio outside its research terms;
- publish captions, images, templates, or provider changes without review; or
- receive source media merely to improve marketing or analytics.

Every model feature has a deterministic fallback, a timeout, a cost ceiling, a fixed schema, and an evaluation set. Changing the model ID requires rerunning output safety, latency, fallback, schema, and cost evaluations. Do not use a moving `chat-latest` alias for production behaviour.

## Growth and social plan

AyahClip should grow through demonstrated craft and creator trust, not generic AI claims. The public content should show the finished Quran clip first and the tool second.

### Audience

1. Existing Quran clip accounts that publish frequently.
2. Reciters and masjid media volunteers.
3. Muslim short-form editors already comfortable with CapCut.
4. First-time creators who need a safe guided workflow.

### Content pillars

| Pillar | Example | Purpose |
| --- | --- | --- |
| Finished clip | One polished 15–30 second result | Demonstrate quality without a feature list |
| Before/after | Raw owned footage beside final vertical composition | Explain the transformation honestly |
| Template study | Split Fade, Gold Line, Nature, Clean Ink | Teach composition and typography |
| Quran craft | Font weight, harakat-safe outline, translation hierarchy | Establish accuracy and care |
| Workflow | Import, confirm range, choose style, export | Reduce first-use uncertainty |
| Creator story | Permission-based account workflow and result | Build social proof without scraping |
| Build transparency | Local processing, no downloader, no watermark stripping | Build trust and set boundaries |

### Four-week controlled beta cadence

| Week | Product action | Public content | Decision gate |
| --- | --- | --- | --- |
| 1 | Recruit ten first-time field testers | Two finished clips, one workflow demonstration | Identify first-run blockers |
| 2 | Fix repeated severity-two friction | Two template studies, one typography comparison | Re-run failed tester paths |
| 3 | Invite five frequent Quran clip creators | Three permission-based before/after posts | Measure saved playable outputs |
| 4 | Publish beta invitation with limits | One privacy/local-processing post, two finished clips | Apply the beta thresholds |

Default cadence is three or four quality posts per week, not daily filler. Each demonstration uses media AyahClip owns or has explicit permission to edit. Never download or repost another creator's video to advertise the product.

### Calls to action

Use one action at a time:

- “Make a clip from a file you own.”
- “Try this template.”
- “Join the small beta and report the first confusing step.”
- “Share an exported result if you choose.”

Avoid “viral,” “10x,” guilt, comment bait, or claims that AI understands the Quran. Promotion must never imply endorsement by a reciter or provider.

### Attribution and measurement

Use coarse campaign source codes only on landing links, for example `tiktok-template-study` or `instagram-beta`. Store the source on the journey event, not a personal social handle. Compare campaigns by confirmed-range journeys and successful exports, not clicks alone.

Promotion advances from controlled beta to broad availability only when the thresholds in [`public-beta-field-test.md`](./public-beta-field-test.md) pass, physical device rows pass, no Quran/privacy severity-one issue remains, and the release gates are green.

## Cost and abuse controls

1. Keep AI captions off when no key is configured and always retain the editorial fallback.
2. Publish WAF limits before broad AI/checkout traffic; warm-instance maps are not distributed quotas.
3. Add per-account quotas only when accounts exist; do not fingerprint anonymous creators to manufacture durable quotas.
4. Set provider budget alerts and a hard monthly ceiling before a marketing push.
5. Keep object storage opt-in, quota-bound, and lifecycle-expiring.
6. Review feature-flag pricing and limits before using flags for every request. Vercel currently documents separate request limits/pricing for its managed Flags product; Edge Config is sufficient for the small operational control set described here. See [Vercel Flags limits](https://vercel.com/docs/flags/vercel-flags/limits-and-pricing).

## Implementation checklist

No future platform phase is complete until all checked items for that phase ship together.

### Accounts

- [ ] Data-flow and threat model approved.
- [ ] Auth, MFA, RLS, object policies, and service-key boundaries implemented.
- [ ] Cross-tenant integration tests pass for every CRUD and signed-URL path.
- [ ] Data export and deletion work across primary data, objects, CRM, derived identifiers, and backups.
- [ ] Privacy policy, terms, retention table, and processor list updated.
- [ ] Migration from anonymous local data is explicit, reversible, and opt-in.

### Operator console

- [ ] Server-enforced RBAC and MFA.
- [ ] Append-only audit events with reason and before/after state.
- [ ] No private-media access by default.
- [ ] Emergency controls have expiry and rollback.
- [ ] Role escalation and audit-log tampering tests pass.

### CRM

- [ ] Explicit purpose-specific consent.
- [ ] Transactional and marketing topics separated.
- [ ] Unsubscribe and deletion synchronise end to end.
- [ ] No anonymous telemetry-to-contact enrichment.
- [ ] Processor, retention, bounce, complaint, and incident owners documented.

### Broad launch

- [ ] Desktop/mobile Studio design implemented after approval.
- [ ] Deterministic green CI and installed-browser release matrices.
- [ ] Search Console verified and sitemap submitted.
- [ ] WAF rules tested in log mode and promoted.
- [ ] Physical iPhone, Android, VoiceOver, thermal, and low-memory gates recorded.
- [ ] Ten-session controlled beta meets the published threshold.
- [ ] Rollback drill completed and recorded.
- [ ] Signed TestFlight build and App Store disclosures complete if native distribution launches simultaneously.

## Decision summary

The marketable near-term product is the account-free local creator, not an unfinished social network or cloud editor. Build accounts only for measured cross-device value. Build administration only with auth, roles, audit, deletion, and isolation. Build CRM only from explicit consent. Use AI only around exact Quran content, never to invent it. Grow through visible editing craft, Quran accuracy, and permission-based finished clips.
