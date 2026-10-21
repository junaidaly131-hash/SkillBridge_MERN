# Admin Email Campaigns

## Scope

This module is a manual marketing-campaign workflow for authenticated SkillBridge administrators. It reuses the existing Resend integration but keeps campaign delivery separate from transactional email. It supports reviewed external-contact CSV imports; it does not scrape contacts, schedule recurring newsletters, infer consent, create member accounts, or send automatically when a campaign/contact is created.

The first built-in template announces SkillBridge AI Tutor. Administrators can edit its subject, preheader, heading, message, CTA label/URL and closing, select eligible recipients, inspect the exact HTML/plain rendering, send a test to their own verified admin email, review, explicitly confirm, and enqueue.

## Consent gap and migration policy

Account creation is not marketing consent. `User.marketingPreference.status` defaults to `unknown`, including for every account that existed before this feature. Unknown users are displayed in audience review but cannot be selected or sent to.

Members can explicitly opt in or out under Profile > Email preferences. Opt-in requires `emailVerifiedAt`. OTP verification and verified Google sign-in set that timestamp going forward. Existing accounts are not silently backfilled because historical login or account existence is not adequate proof of current marketing consent.

Admin accounts, suspended accounts, invalid/unverified addresses, unknown consent, opted-out accounts and active suppression records are excluded. A person who both learns and teaches appears in both audience statistics but is deduplicated by both user ID and normalized email before delivery.

## Safety model

- Campaign drafts are editable; queued campaigns are immutable snapshots.
- Final send requires the literal confirmation `SEND CAMPAIGN`.
- Queue admission is atomically claimed with a temporary `preparing` state so duplicate final-submit requests cannot create two sends.
- Each delivery has unique campaign/user and campaign/email indexes plus a stable Resend idempotency key.
- The worker claims one row atomically with an expiring lease. Default concurrency is one and is capped at five.
- Eligibility and suppression are checked again immediately before every provider request.
- Resend 429/5xx responses retry conservatively with backoff, up to the configured maximum.
- A transport timeout or other response-less failure is recorded as `unknown`; it is not blindly retried because Resend may already have accepted it.
- Provider `accepted` and confirmed `delivered` are separate statuses.
- Webhooks require the exact raw request body and a valid Resend/Svix signature. Event IDs are unique, and older/out-of-order events cannot roll delivery state backward.
- Complaints and hard bounces create durable suppressions. Soft/transient bounces do not.
- Public unsubscribe tokens are opaque HMACs. The database keeps only a SHA-256 token hash. GET only validates and displays confirmation; POST performs the mutation. Campaign mail also carries RFC one-click unsubscribe headers.
- The server-rendered preview and actual send use the same escaped renderer. Only `{{firstName}}` is accepted. Subject/preheader line breaks and unapproved/non-HTTPS CTA origins are rejected.
- New campaign code never logs recipient addresses, content, tokens or provider secrets.

## Data model

- `EmailCampaign`: editable draft, frozen content/audience, sender identity, lifecycle, counts and audit timestamps.
- `EmailCampaignDelivery`: per-recipient queue state, retry/lease data, stable idempotency key, provider status and hashed unsubscribe token.
- `MarketingSuppression`: normalized email suppression for unsubscribe, hard bounce or complaint.
- `EmailWebhookEvent`: deduplicated safe event metadata. A TTL index removes records after 365 days.
- `User.emailVerifiedAt` and `User.marketingPreference`: verification and explicit consent evidence.
- `ExternalMarketingContact`: admin-only external contact metadata, normalized unique email, tags, permission evidence and import provenance.
- `ExternalContactImport`: 24-hour bounded preview rows, mapping/counts and persistent non-sensitive import result history. Original row data is removed after confirmation.
- `ExternalContactImportLock`: one database lease serializes confirmations so concurrent imports cannot bypass the stored-contact ceiling.

## External contacts and CSV imports

CSV upload is preview-only. The server accepts strict UTF-8 (optional BOM), quoted commas/newlines and CRLF/LF, with a default ceiling of 2 MiB and 2,000 rows. The admin maps headers, reviews paginated rows and explicitly confirms. Existing normalized emails and duplicate rows are skipped, never overwritten. Unique indexes provide the final concurrency guard.

Permission defaults to `unknown`. `documented` requires a permission source, a valid non-future timestamp and evidence/reference; a boolean `true` alone remains unknown. Unknown contacts can be stored and reviewed but cannot be selected. External unsubscribe, a matching registered-user opt-out, complaint, hard bounce or active suppression always wins. Source/reference values are admin-only metadata and are never fetched or logged.

Abandoned preview documents expire after 24 hours through a TTL index. Confirmed imports retain counts, timestamps and a bounded error summary for audit, while raw preview rows and mapping are removed. Deleting a contact does not delete `MarketingSuppression`; campaign delivery snapshots remain as the minimum audit/idempotency record under the existing campaign retention policy.

Before deploying this schema change against a database that already has campaign deliveries, run:

```bash
node backend/scripts/migrateExternalCampaignDeliveryIndexes.js
```

This replaces the legacy non-partial campaign/user unique index and creates source-aware partial indexes. Rollback is to disable campaign sending, deploy the previous application revision, and keep the new contact/import collections dormant; do not delete suppression data.

## HTTP endpoints

All `/api/admin/email-campaigns` endpoints require both `authenticateToken` and `requireAdmin`.

- `GET /api/admin/email-campaigns`
- `POST /api/admin/email-campaigns`
- `POST /api/admin/email-campaigns/preview`
- `GET /api/admin/email-campaigns/audience`
- `GET|PATCH /api/admin/email-campaigns/:id`
- `GET /api/admin/email-campaigns/:id/review`
- `POST /api/admin/email-campaigns/:id/test` (rate limited; authenticated admin address only)
- `POST /api/admin/email-campaigns/:id/queue`
- `GET /api/admin/email-campaigns/:id/deliveries`
- `GET|POST /api/email-preferences/unsubscribe/:token`
- `POST /api/webhooks/resend` (raw, signed provider request)
- `PATCH /api/users/me/marketing-preference`
- `GET /api/admin/email-campaigns/external-contacts/sample.csv`
- `POST /api/admin/email-campaigns/external-contacts/imports/preview`
- `POST /api/admin/email-campaigns/external-contacts/imports/:id/remap`
- `GET /api/admin/email-campaigns/external-contacts/imports/:id/rows`
- `GET /api/admin/email-campaigns/external-contacts/imports/:id/errors.csv`
- `POST /api/admin/email-campaigns/external-contacts/imports/:id/confirm`
- `GET /api/admin/email-campaigns/external-contacts/imports`
- `GET|PATCH|DELETE /api/admin/email-campaigns/external-contacts/:id`
- `POST /api/admin/email-campaigns/external-contacts/resolve-audience`

## Production configuration

Set these on the backend only; never expose secrets through a `VITE_` variable:

```env
EMAIL_CAMPAIGN_ENABLED=true
EMAIL_CAMPAIGN_LEGACY_AUDIENCE=false
RESEND_API_KEY=...
RESEND_WEBHOOK_SECRET=...
MARKETING_FROM=noreply@your-verified-domain.example
MARKETING_FROM_NAME=SkillBridge
MARKETING_UNSUBSCRIBE_SECRET=long-random-secret
MARKETING_ALLOWED_CTA_ORIGINS=https://skill-bridge.me,https://www.skill-bridge.me
FRONTEND_URL=https://www.skill-bridge.me
BACKEND_URL=https://your-api.example.com
EMAIL_CAMPAIGN_CONCURRENCY=1
EMAIL_CAMPAIGN_MAX_ATTEMPTS=3
EMAIL_CAMPAIGN_LEASE_MS=120000
EMAIL_CAMPAIGN_REQUEST_TIMEOUT_MS=30000
EMAIL_CAMPAIGN_RETRY_BASE_MS=30000
EMAIL_CAMPAIGN_CONTACT_IMPORT_MAX_BYTES=2097152
EMAIL_CAMPAIGN_CONTACT_IMPORT_MAX_ROWS=2000
EMAIL_CAMPAIGN_CONTACT_MAX_STORED=10000
EMAIL_CAMPAIGN_MAX_AUDIENCE=10000
```

Keep `EMAIL_CAMPAIGN_ENABLED=false` until the sending domain and From address are verified, public frontend/backend URLs work, and the Resend webhook points to `/api/webhooks/resend` with these event types enabled: sent, delivered, delivery delayed, failed, bounced and complained.

For a controlled launch announcement to accounts created before verification and marketing-preference tracking existed, `EMAIL_CAMPAIGN_LEGACY_AUDIENCE=true` includes users whose verification or consent is unrecorded. It never includes admins, suspended accounts, invalid addresses, explicit opt-outs, complaints, hard bounces or other active suppressions. Return it to `false` after the launch campaign so later campaigns require explicit opt-in again.

The webhook endpoint must not be placed behind middleware that parses JSON before signature verification. Run only one worker initially and increase concurrency only after checking the account-specific Resend rate limit and real error/latency metrics.

## Verification and limitations

Automated coverage includes eligibility and cross-source dedupe, unknown consent, suppression, CSV BOM/quoting/newlines/Urdu, mapping/date/row limits, formula-safe exports, external-contact indexes, template escaping/fallback, opaque unsubscribe integrity, retry classification, ambiguous outcomes, webhook ordering/bounce rules, delivery uniqueness and campaign preparation state. A mocked Resend contract test verifies idempotency, tags and one-click headers without network access; no real campaign is sent during development.

Before enabling production sends, perform a limited beta: preview desktop/mobile/plain output, send only a test to the verified admin, validate unsubscribe GET/POST and one-click behavior, replay duplicate/out-of-order signed webhook fixtures, and observe queue latency, errors, unknown outcomes, complaints, bounces and quota/rate-limit behavior.

