# AI Tutor flashcards and study progress (Phase 3B)

Phase 3B adds document-grounded flashcard decks, resumable review sessions, and an explicitly labelled study-progress view on top of Phase 3A. A new deck generation consumes one normal AI Tutor daily turn. Opening a saved deck, reviewing cards, extra practice, and viewing progress do not call the model or consume another AI turn.

The rollout remains controlled by the existing `AI_TUTOR_STUDY_TOOLS_ENABLED` flag. Flashcards are available only for ready, owner-scoped documents whose current embedding version still matches the saved deck.

## User experience

- **Flashcards** creates an immutable 10- or 20-card deck in English, Urdu, or Roman Urdu. Every accepted card has a question, answer, explanation, and citations that resolve to server-supplied document chunks.
- **Review due & new** starts or resumes a finite queue captured when the session begins. Due cards are ordered before new cards. Cards becoming due after the session starts wait for the next session.
- **Extra practice** starts or resumes a separate finite queue containing the deck. Ratings are recorded as extra activity but never change the scheduled due date or interval stage.
- Review is question-first. The answer must be revealed before the rating controls appear. Keyboard focus moves to the first rating control, and visible focus indicators remain available.
- **Progress** reports saved decks/cards, new and currently due cards, scheduled-review activity over 7 and 30 days, extra-practice activity separately, and recent quiz attempts/retakes. It deliberately does not claim mastery or learning outcomes.

Saved decks are immutable. Generating again creates a separate deck, preserving previous review history. Deleting a deck removes its sessions and per-card review state. Deleting a document removes all linked flashcard data as part of the existing resumable document cleanup.

## Scheduling rules

All due calculations use backend UTC time. A client clock cannot advance or delay a card.

- **Again:** reset the interval stage to zero and schedule 10 minutes from the server rating time.
- **Hard:** keep the current interval stage and schedule one day from the server rating time. This includes a first review and cards that previously had a longer interval.
- **Remembered:** advance one stage through `1, 3, 7, 14, 30` days. Further remembered ratings stay capped at 30 days.
- **Extra practice:** retain the prior stage and `nextDueAt` exactly.

Each rating carries an idempotency event ID plus the session and card-state versions observed by the client. Replaying an accepted event returns the already advanced session without changing state again. If card state was saved but session advancement was interrupted, retrying that same event repairs the session; reusing its ID with another rating is rejected. A stale second tab receives a conflict before another card can be mutated. Each card retains the latest 100 review events; older event detail is discarded while aggregate counts and the current schedule remain durable.

## API

- `POST /api/ai-tutor/documents/:documentId/flashcard-decks`
- `DELETE /api/ai-tutor/flashcard-decks/:deckId`
- `POST /api/ai-tutor/flashcard-decks/:deckId/review-sessions`
- `GET /api/ai-tutor/flashcard-review-sessions/:sessionId`
- `POST /api/ai-tutor/flashcard-review-sessions/:sessionId/reveal`
- `POST /api/ai-tutor/flashcard-review-sessions/:sessionId/rate`
- `GET /api/ai-tutor/flashcard-decks/:deckId/cards/:cardId/sources/:chunkId`
- `GET /api/ai-tutor/study-progress?timezone=<IANA timezone>`

All endpoints require authentication and owner-scope the document, deck, session, state, and source excerpt. The progress timezone must be a valid IANA timezone and affects only calendar grouping; scheduling remains UTC.

## Storage and indexes

- `AiTutorFlashcardDeck` stores immutable generated cards and document/index-version metadata.
- `AiTutorFlashcardReviewState` stores one owner-scoped schedule per deck card, aggregate rating counts, optimistic version, and bounded recent events. Its unique owner/deck/card index prevents duplicate schedules.
- `AiTutorFlashcardSession` stores the captured queue, current position, mode, optimistic version, and accepted event IDs. A partial unique index permits only one active session per owner/deck/mode.
- `AiTutorStudyRequest` links the request ID to the generated deck, keeping generation idempotent across retries.

Progress uses bounded indexed aggregations and a bounded recent-attempt query; it does not scan unrestricted message or document text collections.

## Grounding, admission, and limits

Provider output is rejected unless the requested card count is present, required fields are bounded and non-empty, citations map to supplied evidence, and prompts are not duplicates or near-duplicates. Document instructions are treated as untrusted text. Ownership, readiness, consent, and embedding version are checked before admission and again before persistence.

Generation shares the existing atomic AI-turn quota, deployment-wide provider budget, and one-generation-per-user lock. A duplicate request ID produces at most one provider call, quota charge, and saved deck. Capacity is checked before quota/provider admission.

Default limits:

- 30 saved decks and 400 saved cards per user
- 10 saved decks and 100 saved cards per document
- 16 evidence chunks and 36,000 evidence characters per generation
- 6,144 provider output tokens per flashcard generation
- 100 retained recent review events per card
- 20 recent quiz attempts returned in progress

The corresponding bounded variables are documented in `.env.production.example`, `.env.example`, and `backend/.env.example`. Never expose `GEMINI_API_KEY` to the frontend. Restart or redeploy the backend after changing environment values.

## Limited-beta rollout and rollback

1. Deploy with `AI_TUTOR_STUDY_TOOLS_ENABLED=false` so application startup can create the new indexes without exposing the feature.
2. Verify existing document chat, summary, quiz, and deletion paths.
3. Enable the flag for a limited beta and redeploy the backend.
4. Authenticated smoke-test desktop and mobile: generate 10/20 cards, all languages, source excerpts, question/reveal/rate flow, resume, duplicate submission, stale-tab conflict, due ordering, extra-practice isolation, progress timezone grouping, deck deletion, and document deletion.
5. Monitor generation duration, invalid-output rate, quota/budget exhaustion, review conflicts, deletion failures, and progress latency. Logs must not contain document text, flashcard content, answers, or provider keys.
6. Roll back by setting `AI_TUTOR_STUDY_TOOLS_ENABLED=false` and redeploying. Existing data remains private and can be removed through deck or document deletion.

## Verification completed locally

- Backend mocked suite: 80 tests passed, including Phase 3B scheduling, grounding, insufficient-evidence handling, finite/resumable queues, partial-write and duplicate-event recovery, stale-tab rejection, extra-practice isolation, concurrent final-slot capacity, progress windows/timezones, in-flight document races, idempotent generation, and cross-account ownership tests.
- Targeted ESLint for the AI Tutor page and Phase 3B panels passed.
- Frontend production Vite build passed.

These are local mocked and static checks. They do not represent a real-model evaluation, preview deployment, authenticated live smoke test, production performance result, push, or merge. Run a small consented evaluation and limited beta before wider rollout.
