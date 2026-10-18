# AI Tutor document RAG (Phase 2)

Status: limited-beta implementation. Keep `AI_TUTOR_DOCUMENT_RAG_ENABLED=false` until an authenticated preview has passed the ownership, deletion, mobile, and real-model checks below.

## Architecture

The existing Express service owns document ingestion and question answering. Recommendation-service training remains isolated.

- Uploads are limited to one 5 MiB PDF/TXT in memory. Originals are never made public or persisted.
- TXT decoding is strict UTF-8. PDF signature/type checks happen before parsing.
- PDF.js runs in an isolated Node child process with a 128 MiB heap cap, timeout, XFA/eval disabled, and no viewer/link execution. A parser crash or memory failure cannot take down the API process. `pdfjs-dist` is pinned to `5.4.394`: it supports Node 20 and is below the affected range in Mozilla advisory GHSA-hq66-cqwq-w95j. Upgrade to `>=6.2.108` only after the runtime is Node `>=22.13`.
- Processing is synchronous because this deployment has no durable private queue input store. A bounded in-process queue limits local memory, Mongo-backed global slots cap ingestion concurrency across instances, and a Mongo lock permits one ingestion per user. If the process restarts, no original can be recovered: expired `processing` records become `failed` and the user must upload again.
- Text is chunked at roughly 600 tokens with overlap. PDF chunks never cross page boundaries; TXT chunks retain line ranges.
- Gemini `gemini-embedding-001` creates 768-dimensional retrieval embeddings. Model, dimensions, and version are stored on documents/chunks. A mismatch is rejected instead of mixed.
- MongoDB Vector Search is not assumed. Retrieval fetches only owner + selected-document chunks, capped at 400. At 768 float values this is bounded to about 1.2 MiB of raw vector values per maximum-size document before JavaScript/Mongoose overhead. Cosine similarity is combined with a small lexical score for exact terms, then overlapping results are de-duplicated. Five chunks and 14,000 context characters are the defaults.
- The answer provider receives only selected excerpts. It returns structured `S1`/`S2` IDs; the server rejects unknown/malformed IDs and stores only validated chunk references.

## Privacy and lifecycle

The consent version changes in Phase 2, so existing users must acknowledge again. It states that document text is sent to Google for embeddings, retrieved excerpts are sent for answers, and unpaid-tier content may be used to improve Google products and may be human-reviewed. Users are told not to upload personal or confidential material.

Deletion first changes status to `deleting`, immediately denying retrieval. It then removes chunks, requests, messages, and all conversations linked to the document. Only a scrubbed, non-content `deleted` accounting record remains. A generation re-checks `ready` after the provider call, preventing a new answer from being persisted after deletion. This app deletion does not imply deletion of data already processed by Google.

Document contents, questions, answers, and secret values are not logged. Safe IDs, timing, counts, and failure categories are logged.

## API

- `GET /api/ai-tutor/documents`
- `POST /api/ai-tutor/documents` (`multipart/form-data`, field `file`)
- `DELETE /api/ai-tutor/documents/:documentId`
- `POST /api/ai-tutor/conversations` with `{ "mode": "document", "documentId": "..." }`
- `GET /api/ai-tutor/conversations/:conversationId/messages/:messageId/sources/:chunkId`

Document IDs are not accepted on message sends; a conversation's selected document is immutable.

## MongoDB collections and indexes

- `aitutordocuments`: owner/status/time, owner/hash/status.
- `aitutordocumentchunks`: unique owner/document/ordinal.
- `aitutoringestionlocks`: unique owner plus TTL.
- `aitutoringestionslots`: unique numbered global slots plus TTL.
- `aitutoringestionusages`: unique UTC date plus TTL; atomic per-user attempts and global embedded-character budget.
- Existing conversations gain `mode` and `document`, and messages gain validated source references.

## Accounting

- Maximum active documents/user: 5.
- Upload attempts/user/UTC day: 10, claimed atomically.
- Global embedded characters/UTC day: 1,000,000, claimed atomically before external embedding calls.
- In-process ingestion concurrency: 2 with at most 8 queued requests.
- A document question uses the existing request idempotency, generation lock, daily user/global generation quota, and two-attempt provider cap. Query embedding time is included in the generation lock TTL.
- An admitted insufficient-evidence answer consumes one turn; it avoids a generation call and clearly abstains.

## Provider references

- Gemini embeddings and recommended dimensions: https://ai.google.dev/gemini-api/docs/embeddings
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API data-use terms: https://ai.google.dev/gemini-api/terms
- Official JavaScript SDK: https://googleapis.github.io/js-genai/
- PDF.js Node example: https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs
- PDF.js advisory: https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j

## Deployment and rollback

1. Deploy this branch to a preview with a separate test database and `AI_TUTOR_DOCUMENT_RAG_ENABLED=true`.
2. Run authenticated owner-isolation/deletion tests with synthetic documents on desktop and 360 px mobile.
3. Run the real-model 12-question evaluation with authorized test capacity. Do not use production/user files.
4. Observe parsing/embedding durations, 429/5xx categories, queue saturation, retrieval scores, and quota exhaustion without logging content.
5. Enable only for a limited beta. Roll back instantly by setting `AI_TUTOR_DOCUMENT_RAG_ENABLED=false`; Phase 1 general chat remains available. Code rollback can revert the Phase 2 commit. Existing private chunks can then be deleted through the document API or a separately reviewed cleanup script.

## Verification status

- Automated backend tests cover general-chat regression; type/content spoofing; invalid UTF-8, binary, empty, malformed, and text-based PDFs; early page/text limits; PDF page and TXT line metadata; owner/readiness checks before quota admission; citation validation; duplicate document requests; deletion during generation; bounded per-user/process/deployment concurrency; version mismatch; and prompt-injection treatment.
- The reproducible 12-question fixture covers direct facts, paraphrases, Urdu, Roman Urdu, follow-ups, exact code terms, absent information, and an embedded malicious instruction. It currently scores 12/12 for retrieval relevance, citation mapping, factual-support mapping, and abstention with deterministic mocked embeddings/generation. This is pipeline evidence only, not real-model quality evidence.
- Frontend safe-Markdown tests, targeted AI Tutor lint, and the production Vite build pass.
- `npm audit --omit=dev` still reports three high-severity findings in the repository's existing Cloudinary 1.x and Nodemailer 7.x paths. Their available fixes are breaking major upgrades and must be handled/tested separately; document RAG does not call either dependency.

Unverified until preview deployment: real Gemini retrieval/answer quality, multi-instance restart behavior on Render, authenticated cross-account HTTP checks against a separate test database, preview deployment, and UI behavior on physical mobile devices.
