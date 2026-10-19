import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AiTutorStudyError,
  AiTutorStudyService,
  scheduleFlashcardReview,
  validateFlashcards,
} from '../services/aiTutorStudyService.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-19T12:00:00.000Z');

test('flashcard schedule advances remembered through 1, 3, 7, 14, and 30 days', () => {
  let state = { intervalStage: 0, nextDueAt: null };
  for (const [stage, days] of [[1, 1], [2, 3], [3, 7], [4, 14], [5, 30]]) {
    const next = scheduleFlashcardReview(state, 'remembered', 'scheduled', now);
    assert.equal(next.intervalStage, Math.min(stage, 5));
    assert.equal(next.nextDueAt.getTime(), now.getTime() + days * DAY);
    state = next;
  }
  const capped = scheduleFlashcardReview(state, 'remembered', 'scheduled', now);
  assert.equal(capped.intervalStage, 5);
  assert.equal(capped.nextDueAt.getTime(), now.getTime() + 30 * DAY);
});

test('hard keeps progression and schedules one day even after a long interval', () => {
  const result = scheduleFlashcardReview({ intervalStage: 4 }, 'hard', 'scheduled', now);
  assert.equal(result.intervalStage, 4);
  assert.equal(result.nextDueAt.getTime(), now.getTime() + DAY);
});

test('again resets progression and schedules ten minutes from server time', () => {
  const result = scheduleFlashcardReview({ intervalStage: 5 }, 'again', 'scheduled', now);
  assert.equal(result.intervalStage, 0);
  assert.equal(result.nextDueAt.getTime(), now.getTime() + 10 * 60 * 1000);
});

test('extra practice never changes the scheduled due date or stage', () => {
  const due = new Date('2026-11-01T00:00:00.000Z');
  const result = scheduleFlashcardReview({ intervalStage: 3, nextDueAt: due }, 'again', 'extra', now);
  assert.equal(result.intervalStage, 3);
  assert.equal(result.nextDueAt, due);
});

const sources = [
  { sourceId: 'S1', chunkId: '64b000000000000000000011', label: 'Page 1' },
  { sourceId: 'S2', chunkId: '64b000000000000000000012', label: 'Page 2' },
];

test('valid generated flashcards retain only server-mapped citations', () => {
  const result = validateFlashcards({
    cards: [{ prompt: 'What is closure?', answer: 'A function retaining lexical scope.', explanation: '', sourceIds: ['S1'] }],
    insufficientReason: 'Only one supported concept was available.',
  }, sources, 10, 10000);
  assert.equal(result.cards[0].sources[0].chunk, sources[0].chunkId);
});

test('flashcard validation rejects duplicate prompts and unknown citations', () => {
  assert.throws(() => validateFlashcards({
    cards: [
      { prompt: 'Same?', answer: 'One', explanation: '', sourceIds: ['S1'] },
      { prompt: ' same? ', answer: 'Two', explanation: '', sourceIds: ['S2'] },
    ],
    insufficientReason: 'Not enough unique evidence.',
  }, sources, 10, 10000), (error) => error.code === 'STUDY_RESPONSE_INVALID');
  assert.throws(() => validateFlashcards({
    cards: [{ prompt: 'Supported?', answer: 'No', explanation: '', sourceIds: ['S9'] }],
    insufficientReason: 'Short document.',
  }, sources, 10, 10000), (error) => error.code === 'STUDY_RESPONSE_INVALID');
});

test('a shorter flashcard deck requires an explicit insufficiency reason', () => {
  const shortDeck = {
    cards: [{ prompt: 'Only supported prompt', answer: 'Only supported answer', explanation: '', sourceIds: ['S1'] }],
    insufficientReason: '',
  };
  assert.throws(
    () => validateFlashcards(shortDeck, sources, 10, 10000),
    (error) => error.code === 'STUDY_RESPONSE_INVALID'
  );
  const accepted = validateFlashcards(
    { ...shortDeck, insufficientReason: 'The document contains only one distinct supported concept.' },
    sources,
    10,
    10000
  );
  assert.equal(accepted.cards.length, 1);
});

class ReviewRepository {
  constructor() {
    this.deck = {
      _id: '64b000000000000000000101',
      document: '64b000000000000000000001',
      embeddingVersion: 'v1',
      requestedCount: 10,
      language: 'english',
      generatedAt: now,
      cards: [
        { _id: '64b000000000000000000201', prompt: 'Q1', answer: 'A1', sources: [] },
        { _id: '64b000000000000000000202', prompt: 'Q2', answer: 'A2', sources: [] },
      ],
    };
    this.states = this.deck.cards.map((card) => ({
      owner: '64b000000000000000000099', deck: this.deck._id, card: card._id,
      intervalStage: 0, nextDueAt: null, reviewCount: 0, version: 0, recentEvents: [],
    }));
    this.session = null;
    this.failAdvanceOnce = false;
  }
  async findDeck(owner, id) { return owner === this.states[0].owner && id === this.deck._id ? this.deck : null; }
  async findActiveSession(owner, deck, mode) { return this.session?.status === 'active' && this.session.owner === owner && this.session.deck === deck && this.session.mode === mode ? { ...this.session } : null; }
  async listReviewStates() { return this.states.map((item) => ({ ...item })); }
  async createSession(data) { this.session = { _id: '64b000000000000000000301', currentIndex: 0, version: 0, completedEventIds: [], ...data }; return { ...this.session }; }
  async findSession(owner, id) { return this.session?.owner === owner && this.session._id === id ? { ...this.session } : null; }
  async findReviewState(owner, deck, card) { return this.states.find((item) => item.owner === owner && item.deck === deck && item.card === String(card)) || null; }
  async applyReview({ cardId, expectedVersion, event, schedule }) {
    const state = this.states.find((item) => item.card === String(cardId));
    if (state.recentEvents.some((item) => item.eventId === event.eventId)) return { state: { ...state }, duplicate: true };
    if (state.version !== expectedVersion) return { state: { ...state }, duplicate: false, conflict: true };
    Object.assign(state, schedule, { version: state.version + 1, reviewCount: state.reviewCount + 1, latestRating: event.rating, latestReviewedAt: event.reviewedAt });
    state.recentEvents.push(event);
    return { state: { ...state }, duplicate: false };
  }
  async advanceSession({ eventId, expectedVersion, expectedIndex, completedAt }) {
    if (this.failAdvanceOnce) {
      this.failAdvanceOnce = false;
      throw new Error('temporary session persistence failure');
    }
    if (this.session.completedEventIds.includes(eventId)) return { session: { ...this.session }, duplicate: true, conflict: false };
    if (this.session.version !== expectedVersion || this.session.currentIndex !== expectedIndex) return { session: { ...this.session }, conflict: true };
    this.session.currentIndex += 1;
    this.session.version += 1;
    this.session.completedEventIds.push(eventId);
    if (this.session.currentIndex >= this.session.queue.length) Object.assign(this.session, { status: 'completed', completedAt });
    return { session: { ...this.session }, duplicate: false, conflict: false };
  }
}

function reviewService(repository = new ReviewRepository()) {
  return new AiTutorStudyService({
    config: { enabled: true, apiKey: 'set', documentRagEnabled: true, studyToolsEnabled: true, invalidVariables: [], studyReviewEventRetention: 20 },
    repository,
    baseRepository: {},
    documentService: { getReady: async () => ({ embeddingVersion: 'v1' }) },
    provider: {},
    now: () => now,
  });
}

test('scheduled review captures a finite queue and resumes the same active session', async () => {
  const repository = new ReviewRepository();
  const service = reviewService(repository);
  const first = await service.startReviewSession(repository.states[0].owner, repository.deck._id, 'scheduled');
  repository.states.push({ ...repository.states[0], card: '64b000000000000000000203' });
  const resumed = await service.startReviewSession(repository.states[0].owner, repository.deck._id, 'scheduled');
  assert.equal(first.session.totalCards, 2);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.session.totalCards, 2);
});

test('duplicate review event advances schedule and session only once', async () => {
  const repository = new ReviewRepository();
  repository.deck.cards = repository.deck.cards.slice(0, 1);
  repository.states = repository.states.slice(0, 1);
  const service = reviewService(repository);
  const started = await service.startReviewSession(repository.states[0].owner, repository.deck._id, 'scheduled');
  const input = { eventId: 'review_event_000001', rating: 'remembered', expectedStateVersion: 0, expectedSessionVersion: 0 };
  const first = await service.rateFlashcard(repository.states[0].owner, started.session.id, input);
  const duplicate = await service.rateFlashcard(repository.states[0].owner, started.session.id, input);
  assert.equal(first.session.status, 'completed');
  assert.equal(duplicate.duplicate, true);
  assert.equal(repository.states[0].reviewCount, 1);
});

test('retry repairs a review whose card state saved before session advancement failed', async () => {
  const repository = new ReviewRepository();
  repository.deck.cards = repository.deck.cards.slice(0, 1);
  repository.states = repository.states.slice(0, 1);
  repository.failAdvanceOnce = true;
  const service = reviewService(repository);
  const started = await service.startReviewSession(repository.states[0].owner, repository.deck._id, 'scheduled');
  const input = { eventId: 'review_event_repair01', rating: 'remembered', expectedStateVersion: 0, expectedSessionVersion: 0 };

  await assert.rejects(service.rateFlashcard(repository.states[0].owner, started.session.id, input));
  assert.equal(repository.states[0].reviewCount, 1);
  assert.equal(repository.session.currentIndex, 0);

  const repaired = await service.rateFlashcard(repository.states[0].owner, started.session.id, input);
  assert.equal(repaired.duplicate, true);
  assert.equal(repaired.session.status, 'completed');
  assert.equal(repository.states[0].reviewCount, 1);
});

test('reusing a partially applied review event with a different rating is rejected', async () => {
  const repository = new ReviewRepository();
  repository.failAdvanceOnce = true;
  const service = reviewService(repository);
  const started = await service.startReviewSession(repository.states[0].owner, repository.deck._id, 'scheduled');
  const input = { eventId: 'review_event_bound001', rating: 'hard', expectedStateVersion: 0, expectedSessionVersion: 0 };

  await assert.rejects(service.rateFlashcard(repository.states[0].owner, started.session.id, input));
  await assert.rejects(
    service.rateFlashcard(repository.states[0].owner, started.session.id, { ...input, rating: 'again' }),
    (error) => error instanceof AiTutorStudyError && error.code === 'REVIEW_CONFLICT'
  );
  assert.equal(repository.states[0].reviewCount, 1);
});

test('stale second-tab review is rejected before changing another card', async () => {
  const repository = new ReviewRepository();
  const service = reviewService(repository);
  const started = await service.startReviewSession(repository.states[0].owner, repository.deck._id, 'scheduled');
  await service.rateFlashcard(repository.states[0].owner, started.session.id, { eventId: 'review_event_000002', rating: 'hard', expectedStateVersion: 0, expectedSessionVersion: 0 });
  await assert.rejects(
    service.rateFlashcard(repository.states[0].owner, started.session.id, { eventId: 'review_event_000003', rating: 'again', expectedStateVersion: 0, expectedSessionVersion: 0 }),
    (error) => error instanceof AiTutorStudyError && error.code === 'REVIEW_CONFLICT'
  );
  assert.equal(repository.states[1].reviewCount, 0);
});

test('extra-practice rating records activity without changing schedule', async () => {
  const repository = new ReviewRepository();
  repository.states[0].reviewCount = 2;
  repository.states[0].intervalStage = 2;
  repository.states[0].nextDueAt = new Date('2026-10-25T12:00:00.000Z');
  const service = reviewService(repository);
  const started = await service.startReviewSession(repository.states[0].owner, repository.deck._id, 'extra');
  await service.rateFlashcard(repository.states[0].owner, started.session.id, { eventId: 'review_event_000004', rating: 'again', expectedStateVersion: 0, expectedSessionVersion: 0 });
  assert.equal(repository.states[0].intervalStage, 2);
  assert.equal(repository.states[0].nextDueAt.toISOString(), '2026-10-25T12:00:00.000Z');
  assert.equal(repository.states[0].recentEvents[0].mode, 'extra');
});

class GenerationRepository {
  constructor(capacity = {}) {
    this.capacity = { userDecks: 0, documentDecks: 0, userCards: 0, documentCards: 0, ...capacity };
    this.requests = new Map();
    this.deck = null;
    this.providerCalls = 0;
    this.requestSequence = 0;
  }
  async loadChunks() { return [{ _id: '64b000000000000000000501', ordinal: 0, text: 'Closures retain lexical scope.', source: { page: 1 } }]; }
  async findRequest(owner, id) { return this.requests.get(`${owner}:${id}`) || null; }
  async getDeckCapacity() { return this.capacity; }
  async claimRequest(data) {
    const key = `${data.owner}:${data.clientRequestId}`;
    const existing = this.requests.get(key);
    if (existing) return { created: false, request: existing };
    this.requestSequence += 1;
    const row = {
      _id: `64b0000000000000000006${String(this.requestSequence).padStart(2, '0')}`,
      status: 'preparing',
      ...data,
    };
    this.requests.set(key, row);
    return { created: true, request: row };
  }
  async updateRequest(id, update) { const row = [...this.requests.values()].find((item) => item._id === id); Object.assign(row, update); return row; }
  async reserveBudget() { return true; }
  async createDeckWithStates(data) { this.deck = { _id: '64b000000000000000000701', ...data, cards: data.cards.map((card, index) => ({ _id: `64b0000000000000000008${String(index).padStart(2, '0')}`, ...card })) }; return this.deck; }
  async hydrateRequest(request) { return { ...request, deck: this.deck }; }
  async deleteDeckArtifact() { this.deck = null; }
}

function generationService(repository, counters) {
  const owner = '64b000000000000000000099';
  const documentId = '64b000000000000000000001';
  return { owner, documentId, service: new AiTutorStudyService({
    config: {
      enabled: true, apiKey: 'set', documentRagEnabled: true, studyToolsEnabled: true,
      invalidVariables: [], consentVersion: 'test', documentMaxChunks: 10,
      studyMaxDecksPerUser: 30, studyMaxDecksPerDocument: 10,
      studyMaxCardsPerUser: 400, studyMaxCardsPerDocument: 100,
      studyFlashcardMaxEvidenceChunks: 16, studyFlashcardContextChars: 36000,
      studyFlashcardOutputTokens: 6144, studyMaxOutputChars: 60000,
      providerAttempts: 1, retryDelayMs: 0, studyProviderTimeoutMs: 1000,
      studyActionTimeoutMs: 10000, dailyUserLimit: 10, dailyGlobalLimit: 100,
      studyGlobalDailyProviderCalls: 200, studyGlobalDailyInputTokens: 1000000,
      studyGlobalDailyOutputTokens: 500000,
    },
    repository,
    baseRepository: {
      hasConsent: async () => true,
      acquireLock: async () => true,
      releaseLock: async () => {},
      reserveUsage: async () => { counters.quota += 1; return { admitted: true, usage: { userRemaining: 9, globalRemaining: 99, resetAt: now } }; },
    },
    documentService: { getReady: async () => ({ _id: documentId, embeddingVersion: 'v1' }) },
    provider: {
      generateStudyFlashcards: async () => {
        counters.provider += 1;
        return {
          cards: Array.from({ length: 10 }, (_, index) => ({ prompt: `Prompt ${index}`, answer: `Answer ${index}`, explanation: '', sourceIds: ['S1'] })),
          insufficientReason: '',
        };
      },
    },
    now: () => now,
  }) };
}

test('duplicate deck generation uses one provider call, one quota turn, and one saved deck', async () => {
  const repository = new GenerationRepository();
  const counters = { provider: 0, quota: 0 };
  const { owner, documentId, service } = generationService(repository, counters);
  const request = { owner, documentId, clientRequestId: 'flashcard_request_00001', input: { count: 10, language: 'english' } };
  const first = await service.generateFlashcards(request);
  const duplicate = await service.generateFlashcards(request);
  assert.equal(first.deck.cardCount, 10);
  assert.equal(duplicate.duplicate, true);
  assert.equal(counters.provider, 1);
  assert.equal(counters.quota, 1);
});

test('saved deck limit is checked before quota or provider admission', async () => {
  const repository = new GenerationRepository({ documentDecks: 10 });
  const counters = { provider: 0, quota: 0 };
  const { owner, documentId, service } = generationService(repository, counters);
  await assert.rejects(
    service.generateFlashcards({ owner, documentId, clientRequestId: 'flashcard_request_00002', input: { count: 10, language: 'english' } }),
    (error) => error.code === 'FLASHCARD_LIMIT'
  );
  assert.equal(counters.provider, 0);
  assert.equal(counters.quota, 0);
});

test('concurrent generations cannot exceed a final per-user card slot', async () => {
  const repository = new GenerationRepository({ userCards: 390 });
  const counters = { provider: 0, quota: 0 };
  const { owner, documentId, service } = generationService(repository, counters);
  let locked = false;
  let allowProvider;
  let providerStarted;
  const providerGate = new Promise((resolve) => { allowProvider = resolve; });
  const providerReady = new Promise((resolve) => { providerStarted = resolve; });
  service.baseRepository.acquireLock = async () => {
    if (locked) return false;
    locked = true;
    return true;
  };
  service.baseRepository.releaseLock = async () => { locked = false; };
  service.provider.generateStudyFlashcards = async () => {
    counters.provider += 1;
    providerStarted();
    await providerGate;
    return {
      cards: Array.from({ length: 10 }, (_, index) => ({
        prompt: `Concurrent prompt ${index}`,
        answer: `Concurrent answer ${index}`,
        explanation: '',
        sourceIds: ['S1'],
      })),
      insufficientReason: '',
    };
  };

  const first = service.generateFlashcards({
    owner,
    documentId,
    clientRequestId: 'flashcard_concurrent_001',
    input: { count: 10, language: 'english' },
  });
  await providerReady;
  await assert.rejects(
    service.generateFlashcards({
      owner,
      documentId,
      clientRequestId: 'flashcard_concurrent_002',
      input: { count: 10, language: 'english' },
    }),
    (error) => error.code === 'STUDY_GENERATION_IN_PROGRESS'
  );
  allowProvider();
  await first;

  assert.equal(counters.provider, 1);
  assert.equal(counters.quota, 1);
  assert.equal(repository.deck.cards.length, 10);
});

test('document version change during generation removes the newly saved deck', async () => {
  const repository = new GenerationRepository();
  const counters = { provider: 0, quota: 0 };
  const { owner, documentId, service } = generationService(repository, counters);
  let readyChecks = 0;
  service.documentService.getReady = async () => {
    readyChecks += 1;
    return { _id: documentId, embeddingVersion: readyChecks >= 3 ? 'v2' : 'v1' };
  };

  await assert.rejects(
    service.generateFlashcards({
      owner,
      documentId,
      clientRequestId: 'flashcard_document_race01',
      input: { count: 10, language: 'english' },
    }),
    (error) => error.code === 'STUDY_DOCUMENT_CHANGED'
  );
  assert.equal(repository.deck, null);
  assert.equal(counters.provider, 1);
  assert.equal(counters.quota, 1);
});

test('cross-account deck lookup does not reveal deck ownership', async () => {
  const repository = new ReviewRepository();
  const service = reviewService(repository);
  await assert.rejects(
    service.getCurrentDeck('64b000000000000000000098', repository.deck._id),
    (error) => error.code === 'DECK_NOT_FOUND'
  );
});

test('study progress uses exact server-time windows and keeps activity categories separate', async () => {
  let received;
  const repository = {
    progress: async (owner, options) => {
      received = { owner, ...options };
      return {
        deckTotals: { totalDecks: 2, totalCards: 30 },
        neverReviewed: 8,
        due: 5,
        activity: {
          totals: [{ scheduled7: 3, scheduled30: 9, extra7: 2, extra30: 4 }],
          days: [{ _id: { date: '2026-10-19', mode: 'scheduled' }, count: 3 }],
        },
        attempts: [{
          _id: '64b000000000000000000901', quiz: '64b000000000000000000902',
          score: 80, totalQuestions: 10, submittedAt: now, attemptNumber: 2,
        }],
        quizMap: new Map([['64b000000000000000000902', { difficulty: 'beginner', language: 'english' }]]),
      };
    },
  };
  const service = new AiTutorStudyService({
    config: {
      enabled: true, apiKey: 'set', documentRagEnabled: true, studyToolsEnabled: true,
      invalidVariables: [], studyProgressAttemptLimit: 20,
    },
    repository,
    baseRepository: {},
    documentService: {},
    provider: {},
    now: () => now,
  });
  const result = await service.progress('64b000000000000000000099', 'Asia/Karachi');

  assert.equal(received.since7.toISOString(), '2026-10-12T12:00:00.000Z');
  assert.equal(received.since30.toISOString(), '2026-09-19T12:00:00.000Z');
  assert.equal(received.timezone, 'Asia/Karachi');
  assert.equal(result.flashcards.scheduledCompleted7Days, 3);
  assert.equal(result.flashcards.extraPractice7Days, 2);
  assert.equal(result.recentQuizAttempts[0].isRetake, true);
});

test('study progress rejects an invalid timezone before querying storage', async () => {
  let queried = false;
  const service = new AiTutorStudyService({
    config: { enabled: true, apiKey: 'set', documentRagEnabled: true, studyToolsEnabled: true, invalidVariables: [] },
    repository: { progress: async () => { queried = true; } },
    baseRepository: {}, documentService: {}, provider: {}, now: () => now,
  });
  await assert.rejects(
    service.progress('64b000000000000000000099', 'Not/A-Timezone'),
    (error) => error.code === 'INVALID_TIMEZONE'
  );
  assert.equal(queried, false);
});
