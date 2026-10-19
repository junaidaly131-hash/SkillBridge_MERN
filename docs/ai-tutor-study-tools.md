# AI Tutor document study tools (Phase 3A)

Phase 3A adds saved document summaries and grounded practice quizzes on top of the private PDF/TXT pipeline from Phase 2. The rollout flag defaults to off. Chat, saved artifacts, quiz attempts, review, and retakes remain available without another model call; only a newly admitted summary or quiz generation consumes one AI Tutor daily turn.

## User experience

When a ready document is selected, AI Tutor shows three tabs:

- **Chat** keeps the existing grounded document conversation.
- **Summary** generates short or detailed summaries in English, Urdu, or Roman Urdu. Successful results are cached by document index version and options. Regeneration is explicit. Every result reports full or partial coverage and opens its supporting excerpts.
- **Practice quiz** generates 5 or 10 beginner, intermediate, or advanced questions in the same three languages. An attempt can be saved and resumed. The server withholds correct answers, explanations, and sources until submission. Unanswered questions are incorrect; a submitted attempt is immutable; a retake creates a separate attempt without another model call.

Deleting a document deletes its summaries, quizzes, attempts, generation requests, indexed chunks, and linked document chats before the document record is scrubbed.

## API

- `GET /api/ai-tutor/documents/:documentId/study`
- `POST /api/ai-tutor/documents/:documentId/summaries`
- `POST /api/ai-tutor/documents/:documentId/quizzes`
- `POST /api/ai-tutor/quizzes/:quizId/attempts`
- `GET /api/ai-tutor/quiz-attempts/:attemptId`
- `PATCH /api/ai-tutor/quiz-attempts/:attemptId/answers`
- `POST /api/ai-tutor/quiz-attempts/:attemptId/submit`
- `GET /api/ai-tutor/summaries/:summaryId/sources/:chunkId`
- `GET /api/ai-tutor/quiz-attempts/:attemptId/sources/:questionIndex/:chunkId`

All endpoints require authentication and owner-scope every document, artifact, attempt, and excerpt. Generation accepts a server-validated client request ID. Reusing it with a different action, document, index version, or option set is rejected.

## Grounding and validation

Summary coverage walks indexed chunks in document order. Small documents fit in one bounded call. Larger documents use bounded sequential section summaries followed by one bounded consolidation call; if the configured call/context ceiling cannot cover every chunk, the stored result is explicitly marked partial.

Quiz evidence is sampled across the document rather than only from the first matching section. Provider JSON is rejected unless each question has exactly four non-empty distinct options, one valid correct index, an explanation, and valid source IDs. A quiz may contain fewer than requested questions only with an explicit insufficiency reason; zero supported questions is a safe failure.

Document text is treated as untrusted data in the model instructions. Outputs are accepted only when their citations map to server-supplied chunks. Current document ownership, readiness, and embedding version are checked before admission and again before persistence.

Because a full-document summary can send more extracted text than question retrieval, the consent version is advanced and the notice explicitly describes summary and quiz processing.

## Quota, locking, and retries

- One admitted generation consumes one normal AI Tutor daily turn.
- A separate deployment-wide MongoDB counter atomically reserves maximum provider calls, estimated input tokens, and output-token allowance before generation.
- One per-user generation lock covers the full configured action timeout plus a persistence buffer, so chat/summary/quiz generations cannot overlap for that user.
- Each provider call uses the existing maximum-two-attempt policy. Ambiguous full timeouts are not retried automatically.
- Invalid options, missing ownership/readiness/consent, and cached opens fail or return before AI-turn admission.

Provider-budget reservations are deliberately conservative: reserved capacity is not returned after a failed or rejected downstream operation, preventing concurrent oversubscription across application instances.

## Configuration

Enable only after Phase 2 document RAG is configured:

```env
AI_TUTOR_ENABLED=true
AI_TUTOR_DOCUMENT_RAG_ENABLED=true
AI_TUTOR_STUDY_TOOLS_ENABLED=true
```

Optional bounded settings are documented in `.env.production.example`:

- summary direct/section context characters
- quiz context and evidence-chunk ceilings
- maximum provider calls per action
- intermediate/output character ceilings
- summary and quiz output-token ceilings
- per-call and whole-action timeouts
- deployment-wide daily provider-call/input-token/output-token budgets

Never expose `GEMINI_API_KEY` to the frontend. Restart/redeploy the backend after environment changes.

## Limited-beta rollout and rollback

1. Deploy with `AI_TUTOR_STUDY_TOOLS_ENABLED=false` and run migrations/index creation through the normal Mongoose startup path.
2. Verify authenticated document chat and deletion still work.
3. Enable the flag for a limited beta deployment and redeploy the backend.
4. Smoke-test desktop and mobile: cached summary, explicit regeneration, full/partial label, source drawer, quiz generation, resume, unanswered confirmation, submit, review, retake, quota exhaustion, and document deletion.
5. Monitor safe error categories, end-to-end duration, provider-call budget, malformed-output rate, and quota exhaustion. Logs must not include document excerpts, prompts, answers, or provider keys.
6. To roll back immediately, set `AI_TUTOR_STUDY_TOOLS_ENABLED=false` and redeploy. Existing Phase 1/2 chat remains available. Stored study artifacts stay owner-only until their document is deleted.

## Verification completed locally

- Backend mocked suite: 59 tests passed, including 21 Phase 3A coverage/validation/answer-key/grading/idempotency/immutability/retake/ownership/deletion-race tests.
- Frontend production Vite build passed.
- Targeted ESLint for the AI Tutor page and study panel passed.
- `git diff --check` passed.

No real-model evaluation, preview deployment, authenticated production smoke test, push, or merge is represented by these local results. Run a small consented evaluation set before wider rollout.
