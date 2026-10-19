import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiTutorStudyError,
  AiTutorStudyService,
  planSummaryCoverage,
  publicAttempt,
  selectQuizEvidence,
  validateQuiz,
  validateSummary,
} from '../services/aiTutorStudyService.js';

const owner = '64b000000000000000000001';
const documentId = '65c000000000000000000001';
const quizId = '65c000000000000000000002';

const config = {
  enabled: true,
  apiKey: 'test-only',
  invalidVariables: [],
  documentRagEnabled: true,
  studyToolsEnabled: true,
  studySummaryDirectContextChars: 100,
  studySummarySectionContextChars: 60,
  studyMaxProviderCallsPerAction: 3,
  studyQuizMaxEvidenceChunks: 4,
  studyQuizContextChars: 1000,
};

function chunks(count, size = 30) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `chunk-${index}`,
    ordinal: index,
    text: String.fromCharCode(65 + index).repeat(size),
    source: { pageStart: index + 1, pageEnd: index + 1 },
  }));
}

function sources() {
  return [
    { sourceId: 'S1', chunkId: 'chunk-1', label: 'Page 1', text: 'React state is local.' },
    { sourceId: 'S2', chunkId: 'chunk-2', label: 'Page 2', text: 'Effects run after render.' },
  ];
}

function validQuiz(overrides = {}) {
  return {
    questions: [{
      question: 'When does an effect run?',
      options: ['Before render', 'After render', 'Only on the server', 'Never'],
      correctIndex: 1,
      explanation: 'The supplied evidence says effects run after render.',
      sourceIds: ['S2'],
    }],
    insufficientReason: 'The excerpt supports only one safe question.',
    ...overrides,
  };
}

test('short documents use one full-coverage summary call', () => {
  const plan = planSummaryCoverage(chunks(2, 20), config);
  assert.equal(plan.calls, 1);
  assert.equal(plan.full, true);
  assert.equal(plan.covered.length, 2);
});

test('single-call mode reports partial coverage instead of claiming full coverage', () => {
  const plan = planSummaryCoverage(chunks(5, 50), { ...config, studyMaxProviderCallsPerAction: 1 });
  assert.equal(plan.calls, 1);
  assert.equal(plan.full, false);
  assert.ok(plan.covered.length < 5);
});

test('long summary plans stay inside the provider-call ceiling', () => {
  const plan = planSummaryCoverage(chunks(12, 40), config);
  assert.ok(plan.calls <= config.studyMaxProviderCallsPerAction);
  assert.equal(plan.consolidate, true);
});

test('summary coverage is sequential and deterministic', () => {
  const plan = planSummaryCoverage(chunks(8, 40), config);
  assert.deepEqual(plan.covered.map((item) => item.sourceId), plan.covered.map((_, index) => `S${index + 1}`));
});

test('quiz evidence is spread from the beginning through the end of a document', () => {
  const selected = selectQuizEvidence(chunks(10, 20).map((chunk) => ({
    sourceId: `S${chunk.ordinal + 1}`, chunkId: chunk._id, label: `Page ${chunk.ordinal + 1}`, text: chunk.text,
  })), 4, 1000);
  assert.equal(selected[0].sourceId, 'S1');
  assert.equal(selected.at(-1).sourceId, 'S10');
});

test('valid summaries retain only server-mapped citations', () => {
  const result = validateSummary({
    overview: 'A grounded overview.', keyConcepts: ['State'],
    importantTerms: [{ term: 'Effect', definition: 'Runs after render.' }], sourceIds: ['S1', 'S2'],
  }, sources(), 1000);
  assert.deepEqual(result.sources.map((source) => source.chunk), ['chunk-1', 'chunk-2']);
});

test('summary validation fails closed on an unknown citation', () => {
  assert.throws(
    () => validateSummary({ overview: 'Claim', keyConcepts: [], importantTerms: [], sourceIds: ['S9'] }, sources(), 1000),
    (error) => error.code === 'STUDY_RESPONSE_INVALID'
  );
});

test('summary validation enforces the output character ceiling', () => {
  assert.throws(
    () => validateSummary({ overview: 'x'.repeat(101), keyConcepts: [], importantTerms: [], sourceIds: ['S1'] }, sources(), 100),
    (error) => error.code === 'STUDY_RESPONSE_INVALID'
  );
});

test('quiz validation requires exactly four distinct options', () => {
  const generated = validQuiz();
  generated.questions[0].options = ['A', 'A', 'B', 'C'];
  assert.throws(() => validateQuiz(generated, sources(), 5, 10000), (error) => error.code === 'STUDY_RESPONSE_INVALID');
});

test('quiz validation rejects unknown evidence references', () => {
  const generated = validQuiz();
  generated.questions[0].sourceIds = ['S99'];
  assert.throws(() => validateQuiz(generated, sources(), 5, 10000), (error) => error.code === 'STUDY_RESPONSE_INVALID');
});

test('a shorter quiz must explain why fewer safe questions were produced', () => {
  assert.throws(
    () => validateQuiz(validQuiz({ insufficientReason: '' }), sources(), 5, 10000),
    (error) => error.code === 'STUDY_RESPONSE_INVALID'
  );
});

test('a supported shorter quiz is accepted with a clear insufficiency reason', () => {
  const result = validateQuiz(validQuiz(), sources(), 5, 10000);
  assert.equal(result.questions.length, 1);
  assert.match(result.insufficientReason, /only one/i);
});

const quiz = {
  _id: quizId,
  document: documentId,
  embeddingVersion: 'v1',
  requestedCount: 5,
  difficulty: 'beginner',
  language: 'english',
  generatedAt: new Date(),
  questions: [
    { question: 'Q1?', options: ['A', 'B', 'C', 'D'], correctIndex: 1, explanation: 'Because B.', sources: [{ sourceId: 'S1', chunk: 'chunk-1', label: 'Page 1' }] },
    { question: 'Q2?', options: ['A', 'B', 'C', 'D'], correctIndex: 2, explanation: 'Because C.', sources: [{ sourceId: 'S2', chunk: 'chunk-2', label: 'Page 2' }] },
  ],
};

test('in-progress attempts never expose answer keys, explanations, or sources', () => {
  const result = publicAttempt({ _id: 'attempt-1', document: documentId, quiz: quizId, status: 'in_progress', answers: [], totalQuestions: 2 }, quiz);
  assert.equal(result.quiz.questions[0].correctIndex, undefined);
  assert.equal(result.quiz.questions[0].explanation, undefined);
  assert.equal(result.quiz.questions[0].sources, undefined);
});

test('submitted attempts expose review data and score', () => {
  const result = publicAttempt({ _id: 'attempt-1', document: documentId, quiz: quizId, status: 'submitted', answers: [], score: 50, correctCount: 1, totalQuestions: 2 }, quiz);
  assert.equal(result.quiz.questions[0].correctIndex, 1);
  assert.equal(result.quiz.questions[0].sources[0].sourceId, 'S1');
  assert.equal(result.score, 50);
});

class AttemptRepository {
  constructor() {
    this.sequence = 0;
    this.attempts = new Map();
  }
  async findQuiz(requestOwner, id) { return requestOwner === owner && String(id) === quizId ? quiz : null; }
  async createAttempt(data) {
    const row = { _id: `attempt-${++this.sequence}`, ...data, status: 'in_progress', answers: [], startedAt: new Date() };
    this.attempts.set(row._id, row);
    return { ...row };
  }
  async findAttempt(requestOwner, id) { const row = this.attempts.get(String(id)); return requestOwner === owner && row ? { ...row } : null; }
  async saveAnswer(requestOwner, id, questionIndex, selectedOptionIndex) {
    const row = this.attempts.get(String(id));
    if (!row || row.status !== 'in_progress' || requestOwner !== owner) return null;
    row.answers = [...row.answers.filter((item) => item.questionIndex !== questionIndex), { questionIndex, selectedOptionIndex }];
    return { ...row };
  }
  async submitAttempt(requestOwner, id, grading) {
    const row = this.attempts.get(String(id));
    if (!row || row.status !== 'in_progress' || requestOwner !== owner) return null;
    Object.assign(row, grading, { status: 'submitted', submittedAt: new Date() });
    return { ...row };
  }
}

function attemptService(repository = new AttemptRepository()) {
  return {
    repository,
    service: new AiTutorStudyService({
      config,
      repository,
      baseRepository: {},
      documentService: { getReady: async () => ({ embeddingVersion: 'v1' }) },
      provider: {},
    }),
  };
}

test('backend grading counts unanswered questions as incorrect and submit is idempotent', async () => {
  const { service } = attemptService();
  const started = await service.startAttempt(owner, quizId);
  await service.saveAnswer(owner, started.attempt.id, 0, 1);
  const first = await service.submitAttempt(owner, started.attempt.id);
  const second = await service.submitAttempt(owner, started.attempt.id);
  assert.equal(first.attempt.correctCount, 1);
  assert.equal(first.attempt.score, 50);
  assert.equal(second.duplicate, true);
  assert.equal(second.attempt.score, 50);
});

test('submitted attempts are immutable', async () => {
  const { service } = attemptService();
  const started = await service.startAttempt(owner, quizId);
  await service.submitAttempt(owner, started.attempt.id);
  await assert.rejects(
    service.saveAnswer(owner, started.attempt.id, 0, 1),
    (error) => error instanceof AiTutorStudyError && error.code === 'ATTEMPT_SUBMITTED'
  );
});

test('retakes create separate attempts without an AI provider call', async () => {
  const { service } = attemptService();
  const first = await service.startAttempt(owner, quizId);
  const second = await service.startAttempt(owner, quizId);
  assert.notEqual(first.attempt.id, second.attempt.id);
});

test('quiz and attempt lookup is owner scoped', async () => {
  const { service } = attemptService();
  await assert.rejects(service.startAttempt('64b000000000000000000099', quizId), (error) => error.code === 'STUDY_NOT_FOUND');
});

class AdmissionRepository {
  constructor(slots = 10) {
    this.slots = slots;
    this.requests = new Map();
    this.sequence = 0;
  }
  async claimRequest(data) {
    const row = { _id: `request-${++this.sequence}`, status: 'preparing', ...data };
    this.requests.set(row._id, row);
    return { created: true, request: row };
  }
  async updateRequest(id, update) { Object.assign(this.requests.get(id), update); }
  async reserveBudget() {
    if (this.slots <= 0) return false;
    this.slots -= 1;
    return true;
  }
}

class AdmissionBaseRepository {
  constructor() {
    this.locks = new Set();
    this.ttls = [];
    this.usage = 0;
  }
  async acquireLock(requestOwner, token, ttl) {
    this.ttls.push(ttl);
    if (this.locks.has(requestOwner)) return false;
    this.locks.add(requestOwner);
    return true;
  }
  async releaseLock(requestOwner) { this.locks.delete(requestOwner); }
  async reserveUsage() {
    this.usage += 1;
    return { admitted: true, usage: { userRemaining: 9, globalRemaining: 99, resetAt: new Date() } };
  }
}

function admissionService(studyRepository, baseRepository, overrides = {}) {
  return new AiTutorStudyService({
    config: {
      ...config,
      dailyUserLimit: 10,
      dailyGlobalLimit: 100,
      studyActionTimeoutMs: 100,
      studyProviderTimeoutMs: 200,
      providerAttempts: 2,
      retryDelayMs: 10,
      ...overrides,
    },
    repository: studyRepository,
    baseRepository,
    documentService: {},
    provider: {},
  });
}

test('study generation lock covers all planned attempts even when action timeout is too small', async () => {
  const repository = new AdmissionRepository();
  const baseRepository = new AdmissionBaseRepository();
  const service = admissionService(repository, baseRepository);
  await service.admit({
    owner,
    document: { _id: documentId, embeddingVersion: 'v1' },
    action: 'summary',
    options: { language: 'english', length: 'short', regenerate: false },
    clientRequestId: 'lock_duration_request_01',
    reservation: { calls: 4, inputTokens: 100, outputTokens: 100 },
  });
  assert.ok(baseRepository.ttls[0] >= 4 * 200 + 2 * 10 + 30000);
});

test('shared study budget admits exactly one concurrent request when one slot remains', async () => {
  const repository = new AdmissionRepository(1);
  const firstBase = new AdmissionBaseRepository();
  const secondBase = new AdmissionBaseRepository();
  const first = admissionService(repository, firstBase);
  const second = admissionService(repository, secondBase);
  const requests = await Promise.allSettled([
    first.admit({ owner, document: { _id: documentId, embeddingVersion: 'v1' }, action: 'quiz', options: { count: 5 }, clientRequestId: 'budget_concurrency_01', reservation: { calls: 1, inputTokens: 10, outputTokens: 10 } }),
    second.admit({ owner: '64b000000000000000000002', document: { _id: documentId, embeddingVersion: 'v1' }, action: 'quiz', options: { count: 5 }, clientRequestId: 'budget_concurrency_02', reservation: { calls: 1, inputTokens: 10, outputTokens: 10 } }),
  ]);
  assert.equal(requests.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(requests.filter((result) => result.status === 'rejected' && result.reason.code === 'STUDY_BUDGET_LIMIT').length, 1);
  assert.equal(firstBase.usage + secondBase.usage, 1);
});

test('document deletion between generation and persistence removes the just-saved artifact', async () => {
  let readyChecks = 0;
  let deletedSummary = false;
  const requests = new Map();
  const repository = {
    findRequest: async () => null,
    findSummary: async () => null,
    loadChunks: async () => chunks(1, 25),
    claimRequest: async (data) => {
      const request = { _id: 'request-delete-race', ...data, status: 'preparing' };
      requests.set(request._id, request);
      return { created: true, request };
    },
    updateRequest: async (id, update) => Object.assign(requests.get(id), update),
    reserveBudget: async () => true,
    saveSummary: async (data) => ({ _id: 'summary-delete-race', ...data }),
    deleteSummary: async () => { deletedSummary = true; },
  };
  const baseRepository = {
    hasConsent: async () => true,
    acquireLock: async () => true,
    releaseLock: async () => {},
    reserveUsage: async () => ({ admitted: true, usage: { userRemaining: 9, globalRemaining: 99, resetAt: new Date() } }),
  };
  const service = new AiTutorStudyService({
    config: {
      ...config,
      consentVersion: 'test',
      documentMaxChunks: 20,
      providerAttempts: 1,
      retryDelayMs: 0,
      studyActionTimeoutMs: 10000,
      studyProviderTimeoutMs: 1000,
      studySummaryOutputTokens: 500,
      studyMaxIntermediateChars: 1000,
      studyMaxOutputChars: 5000,
    },
    repository,
    baseRepository,
    documentService: {
      getReady: async () => {
        readyChecks += 1;
        if (readyChecks >= 3) throw new Error('deleted');
        return { _id: documentId, embeddingVersion: 'v1' };
      },
    },
    provider: {
      generateStudySummary: async () => ({
        overview: 'Supported overview.', keyConcepts: [], importantTerms: [], sourceIds: ['S1'],
      }),
    },
  });

  await assert.rejects(
    service.generateSummary({
      owner,
      documentId,
      clientRequestId: 'document_delete_race_01',
      input: { language: 'english', length: 'short', regenerate: false },
    }),
    (error) => error.code === 'STUDY_DOCUMENT_CHANGED'
  );
  assert.equal(deletedSummary, true);
});
