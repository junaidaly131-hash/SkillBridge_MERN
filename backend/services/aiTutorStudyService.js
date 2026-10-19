import crypto from 'node:crypto';
import { getAiTutorAvailability } from '../config/aiTutor.js';
import { sourceLabel } from './aiTutorRetrieval.js';
import { AiTutorProviderError } from './aiTutorProvider.js';

const STUDY_ERRORS = {
  STUDY_TOOLS_DISABLED: [503, 'Document study tools are currently unavailable.'],
  STUDY_CONSENT_REQUIRED: [428, 'Accept the AI processing notice before generating study material.'],
  STUDY_NOT_FOUND: [404, 'Study material not found.'],
  STUDY_REQUEST_CONFLICT: [409, 'That request ID was already used for different study options.'],
  STUDY_REQUEST_IN_PROGRESS: [409, 'This study material is already being generated.'],
  STUDY_GENERATION_IN_PROGRESS: [409, 'Another AI Tutor response is still being generated.'],
  STUDY_INVALID_OPTIONS: [400, 'Choose valid study options.'],
  STUDY_RESPONSE_INVALID: [502, 'AI Tutor returned study material that could not be validated.'],
  STUDY_ACTION_TIMEOUT: [504, 'AI Tutor took too long to prepare this study material. Try a shorter document.'],
  STUDY_INSUFFICIENT_CONTENT: [422, 'This document does not contain enough supported content for that quiz.'],
  STUDY_BUDGET_LIMIT: [503, 'Study generation has reached today\'s shared provider budget. Try again after midnight UTC.'],
  STUDY_DOCUMENT_CHANGED: [409, 'This document changed while study material was being prepared.'],
  USER_DAILY_LIMIT: [429, "You've used today's AI Tutor messages. Your allowance resets at midnight UTC."],
  GLOBAL_DAILY_LIMIT: [429, "AI Tutor has reached today's shared limit. Please try again after midnight UTC."],
  PROVIDER_QUOTA: [503, 'AI Tutor is busy because its provider limit was reached. Please try again later.'],
  PROVIDER_TIMEOUT: [504, 'AI Tutor took too long to prepare this study material.'],
  PROVIDER_CONFIG: [503, 'AI Tutor is temporarily unavailable because of a configuration problem.'],
  PROVIDER_UNAVAILABLE: [503, 'AI Tutor is temporarily unavailable. Please try again later.'],
  PROVIDER_NETWORK: [503, 'AI Tutor could not reach its provider. Please try again later.'],
  PROVIDER_ERROR: [502, 'AI Tutor could not prepare this study material.'],
  SAFETY_BLOCKED: [422, 'AI Tutor could not safely prepare study material from this document.'],
  ATTEMPT_NOT_FOUND: [404, 'Quiz attempt not found.'],
  ATTEMPT_SUBMITTED: [409, 'This quiz attempt has already been submitted and cannot be changed.'],
  INVALID_ANSWER: [400, 'Choose a valid answer for this question.'],
  FLASHCARD_LIMIT: [409, 'Delete a saved flashcard deck before generating another one.'],
  FLASHCARD_INSUFFICIENT_CONTENT: [422, 'This document does not contain enough supported content for flashcards.'],
  DECK_NOT_FOUND: [404, 'Flashcard deck not found.'],
  REVIEW_SESSION_NOT_FOUND: [404, 'Flashcard review session not found.'],
  REVIEW_SESSION_COMPLETE: [409, 'This review session is already complete.'],
  REVIEW_CONFLICT: [409, 'This card was updated in another tab. Refresh the review session to continue.'],
  INVALID_REVIEW: [400, 'Choose a valid flashcard review action.'],
  INVALID_TIMEZONE: [400, 'Choose a valid timezone.'],
};

export class AiTutorStudyError extends Error {
  constructor(code, extras = {}) {
    const [status, message] = STUDY_ERRORS[code] || [500, 'Study material could not be completed.'];
    super(message);
    this.name = 'AiTutorStudyError';
    this.code = code;
    this.status = status;
    Object.assign(this, extras);
  }
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const idOf = (value) => String(value?._id || value?.id || value);
const estimateTokens = (characters) => Math.max(1, Math.ceil(characters / 4));

function sourceForChunk(chunk) {
  return {
    sourceId: `S${Number(chunk.ordinal) + 1}`,
    chunkId: idOf(chunk),
    label: sourceLabel(chunk.source),
    text: chunk.text,
  };
}

function materialForSources(sources) {
  return sources.map((source) => `[${source.sourceId} | ${source.label}]\n${source.text}`).join('\n\n');
}

function selectSequentialBatches(sources, maxChars, maxBatches) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const source of sources) {
    const nextSize = source.text.length + source.sourceId.length + source.label.length + 8;
    if (current.length && size + nextSize > maxChars) {
      batches.push(current);
      if (batches.length >= maxBatches) return batches;
      current = [];
      size = 0;
    }
    if (!current.length && nextSize > maxChars) {
      current.push({ ...source, text: source.text.slice(0, maxChars), truncated: true });
      size = maxChars;
    } else {
      current.push(source);
      size += nextSize;
    }
  }
  if (current.length && batches.length < maxBatches) batches.push(current);
  return batches;
}

export function planSummaryCoverage(chunks, config) {
  const sources = chunks.map(sourceForChunk);
  const totalChars = materialForSources(sources).length;
  if (totalChars <= config.studySummaryDirectContextChars) {
    return { batches: [sources], consolidate: false, covered: sources, full: true, calls: 1 };
  }
  if (config.studyMaxProviderCallsPerAction === 1) {
    const batches = selectSequentialBatches(sources, config.studySummaryDirectContextChars, 1);
    const covered = batches.flat();
    return { batches, consolidate: false, covered, full: covered.length === sources.length && !covered.some((source) => source.truncated), calls: 1 };
  }
  const batches = selectSequentialBatches(
    sources,
    config.studySummarySectionContextChars,
    config.studyMaxProviderCallsPerAction - 1
  );
  const covered = batches.flat();
  return {
    batches,
    consolidate: true,
    covered,
    full: covered.length === sources.length && !covered.some((source) => source.truncated),
    calls: batches.length + 1,
  };
}

function selectQuizEvidence(sources, maxChunks, maxChars) {
  const desired = Math.min(maxChunks, sources.length);
  const selected = [];
  const seen = new Set();
  for (let index = 0; index < desired; index += 1) {
    const position = desired === 1 ? 0 : Math.round((index * (sources.length - 1)) / (desired - 1));
    if (!seen.has(position)) {
      selected.push(sources[position]);
      seen.add(position);
    }
  }
  const bounded = [];
  let used = 0;
  for (const source of selected) {
    if (bounded.length && used + source.text.length > maxChars) continue;
    const text = bounded.length ? source.text : source.text.slice(0, maxChars);
    bounded.push({ ...source, text });
    used += text.length;
  }
  return bounded;
}

function validateSummary(generated, allowedSources, maxChars) {
  const allowed = new Map(allowedSources.map((source) => [source.sourceId, source]));
  const overview = clean(generated?.overview);
  const rawConcepts = Array.isArray(generated?.keyConcepts) ? generated.keyConcepts : [];
  const rawTerms = Array.isArray(generated?.importantTerms) ? generated.importantTerms : [];
  const keyConcepts = Array.isArray(generated?.keyConcepts)
    ? generated.keyConcepts.map(clean).filter(Boolean)
    : [];
  const importantTerms = Array.isArray(generated?.importantTerms)
    ? generated.importantTerms
        .map((item) => ({ term: clean(item?.term), definition: clean(item?.definition) }))
        .filter((item) => item.term && item.definition)
    : [];
  const ids = Array.isArray(generated?.sourceIds) ? [...new Set(generated.sourceIds)] : [];
  const size = overview.length + keyConcepts.join('').length + importantTerms.reduce((sum, item) => sum + item.term.length + item.definition.length, 0);
  if (
    !overview || overview.length > 12000 || rawConcepts.length > 30 || rawTerms.length > 40 ||
    keyConcepts.length !== rawConcepts.length || keyConcepts.some((item) => item.length > 3000) ||
    importantTerms.length !== rawTerms.length ||
    importantTerms.some((item) => item.term.length > 180 || item.definition.length > 1200) ||
    !ids.length || ids.some((id) => !allowed.has(id)) || size > maxChars
  ) {
    throw new AiTutorStudyError('STUDY_RESPONSE_INVALID');
  }
  return {
    overview,
    keyConcepts,
    importantTerms,
    sources: ids.map((id) => {
      const source = allowed.get(id);
      return { sourceId: id, chunk: source.chunkId, label: source.label };
    }),
  };
}

function validateQuiz(generated, allowedSources, requestedCount, maxChars) {
  const allowed = new Map(allowedSources.map((source) => [source.sourceId, source]));
  const insufficientReason = clean(generated?.insufficientReason);
  if (insufficientReason.length > 500 || !Array.isArray(generated?.questions) || !generated.questions.length || generated.questions.length > requestedCount) {
    throw new AiTutorStudyError(generated?.questions?.length === 0 ? 'STUDY_INSUFFICIENT_CONTENT' : 'STUDY_RESPONSE_INVALID');
  }
  if (generated.questions.length < requestedCount && !insufficientReason) {
    throw new AiTutorStudyError('STUDY_RESPONSE_INVALID');
  }
  const seenQuestions = new Set();
  let size = insufficientReason.length;
  const questions = generated.questions.map((item) => {
    const question = clean(item?.question);
    const options = Array.isArray(item?.options) ? item.options.map(clean) : [];
    const normalized = options.map((option) => option.toLocaleLowerCase());
    const explanation = clean(item?.explanation);
    const sourceIds = Array.isArray(item?.sourceIds) ? [...new Set(item.sourceIds)] : [];
    const key = question.toLocaleLowerCase();
    const correctIndex = Number(item?.correctIndex);
    if (
      !question || question.length > 1200 || seenQuestions.has(key) || options.length !== 4 ||
      options.some((option) => !option || option.length > 800) || new Set(normalized).size !== 4 ||
      normalized.some((option) => /^(all|none) of the above[.!]?$/.test(option)) ||
      !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3 ||
      !explanation || explanation.length > 2400 || !sourceIds.length ||
      sourceIds.some((id) => !allowed.has(id))
    ) {
      throw new AiTutorStudyError('STUDY_RESPONSE_INVALID');
    }
    seenQuestions.add(key);
    size += question.length + options.join('').length + explanation.length;
    return {
      question,
      options,
      correctIndex,
      explanation,
      sources: sourceIds.map((id) => {
        const source = allowed.get(id);
        return { sourceId: id, chunk: source.chunkId, label: source.label };
      }),
    };
  });
  if (size > maxChars) throw new AiTutorStudyError('STUDY_RESPONSE_INVALID');
  return { questions, insufficientReason };
}

function validateFlashcards(generated, allowedSources, requestedCount, maxChars) {
  const allowed = new Map(allowedSources.map((source) => [source.sourceId, source]));
  const insufficientReason = clean(generated?.insufficientReason);
  if (
    insufficientReason.length > 500 ||
    !Array.isArray(generated?.cards) ||
    !generated.cards.length ||
    generated.cards.length > requestedCount
  ) {
    throw new AiTutorStudyError(
      generated?.cards?.length === 0 ? 'FLASHCARD_INSUFFICIENT_CONTENT' : 'STUDY_RESPONSE_INVALID'
    );
  }
  if (generated.cards.length < requestedCount && !insufficientReason) {
    throw new AiTutorStudyError('STUDY_RESPONSE_INVALID');
  }
  const seen = [];
  let size = insufficientReason.length;
  const cards = generated.cards.map((item) => {
    const prompt = clean(item?.prompt);
    const answer = clean(item?.answer);
    const explanation = clean(item?.explanation);
    const sourceIds = Array.isArray(item?.sourceIds) ? [...new Set(item.sourceIds)] : [];
    const normalized = prompt.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const tokens = new Set(normalized.split(' ').filter(Boolean));
    const nearDuplicate = seen.some((previous) => {
      const intersection = [...tokens].filter((token) => previous.has(token)).length;
      const union = new Set([...tokens, ...previous]).size;
      return union > 0 && intersection / union >= 0.85;
    });
    if (
      prompt.length < 5 || prompt.length > 1200 || nearDuplicate ||
      !answer || answer.length > 2400 || explanation.length > 1600 ||
      !sourceIds.length || sourceIds.some((id) => !allowed.has(id))
    ) {
      throw new AiTutorStudyError('STUDY_RESPONSE_INVALID');
    }
    seen.push(tokens);
    size += prompt.length + answer.length + explanation.length;
    return {
      prompt,
      answer,
      explanation,
      sources: sourceIds.map((id) => {
        const source = allowed.get(id);
        return { sourceId: id, chunk: source.chunkId, label: source.label };
      }),
    };
  });
  if (size > maxChars) throw new AiTutorStudyError('STUDY_RESPONSE_INVALID');
  return { cards, insufficientReason };
}

function publicSources(sources = []) {
  return sources.map((source) => ({ sourceId: source.sourceId, chunkId: idOf(source.chunk), label: source.label }));
}

function publicSummary(summary) {
  return {
    id: idOf(summary), documentId: idOf(summary.document), language: summary.language, length: summary.length,
    overview: summary.overview, keyConcepts: summary.keyConcepts || [], importantTerms: summary.importantTerms || [],
    sources: publicSources(summary.sources), coverage: summary.coverage, generatedAt: summary.generatedAt,
  };
}

function publicQuiz(quiz) {
  return {
    id: idOf(quiz), documentId: idOf(quiz.document), requestedCount: quiz.requestedCount,
    questionCount: quiz.questions?.length || 0, difficulty: quiz.difficulty, language: quiz.language,
    insufficientReason: quiz.insufficientReason || '', generatedAt: quiz.generatedAt,
  };
}

function publicDeck(deck) {
  return {
    id: idOf(deck),
    documentId: idOf(deck.document),
    requestedCount: deck.requestedCount,
    cardCount: deck.cards?.length || 0,
    language: deck.language,
    insufficientReason: deck.insufficientReason || '',
    generatedAt: deck.generatedAt,
    newCount: deck.reviewCounts?.newCount || 0,
    dueCount: deck.reviewCounts?.dueCount || 0,
  };
}

const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];

export function scheduleFlashcardReview(state, rating, mode, now = new Date()) {
  if (!['again', 'hard', 'remembered'].includes(rating) || !['scheduled', 'extra'].includes(mode)) {
    throw new AiTutorStudyError('INVALID_REVIEW');
  }
  const currentStage = Math.max(0, Math.min(5, Number(state?.intervalStage || 0)));
  if (mode === 'extra') {
    return { intervalStage: currentStage, nextDueAt: state?.nextDueAt || null };
  }
  if (rating === 'again') {
    return { intervalStage: 0, nextDueAt: new Date(now.getTime() + 10 * 60 * 1000) };
  }
  if (rating === 'hard') {
    return { intervalStage: currentStage, nextDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
  }
  const days = REVIEW_INTERVAL_DAYS[Math.min(currentStage, REVIEW_INTERVAL_DAYS.length - 1)];
  return {
    intervalStage: Math.min(5, currentStage + 1),
    nextDueAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
  };
}

function cardFromDeck(deck, cardId) {
  return deck.cards?.find((card) => idOf(card) === String(cardId)) || null;
}

function publicReviewSession(session, deck, state, reveal = false) {
  const cardId = session.status === 'active' ? session.queue?.[session.currentIndex] : null;
  const card = cardId ? cardFromDeck(deck, cardId) : null;
  return {
    id: idOf(session),
    deck: publicDeck(deck),
    mode: session.mode,
    status: session.status,
    currentIndex: session.currentIndex,
    totalCards: session.queue?.length || 0,
    version: session.version,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    currentCard: card ? {
      id: idOf(card),
      prompt: card.prompt,
      stateVersion: state?.version ?? 0,
      ...(reveal ? {
        answer: card.answer,
        explanation: card.explanation || '',
        sources: publicSources(card.sources),
      } : {}),
    } : null,
  };
}

function publicAttempt(attempt, quiz) {
  const submitted = attempt.status === 'submitted';
  const answers = new Map((attempt.answers || []).map((answer) => [answer.questionIndex, answer.selectedOptionIndex]));
  return {
    id: idOf(attempt), quizId: idOf(quiz), documentId: idOf(attempt.document), status: attempt.status,
    answers: [...answers].map(([questionIndex, selectedOptionIndex]) => ({ questionIndex, selectedOptionIndex })),
    score: submitted ? attempt.score : null, correctCount: submitted ? attempt.correctCount : null,
    totalQuestions: attempt.totalQuestions, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt,
    quiz: {
      ...publicQuiz(quiz),
      questions: (quiz.questions || []).map((question, index) => ({
        index,
        question: question.question,
        options: question.options,
        ...(submitted ? {
          correctIndex: question.correctIndex,
          explanation: question.explanation,
          sources: publicSources(question.sources),
        } : {}),
      })),
    },
  };
}

function optionsFingerprint(action, documentId, embeddingVersion, options) {
  return crypto.createHash('sha256').update(JSON.stringify({ action, documentId: String(documentId), embeddingVersion, options })).digest('hex');
}

function providerTimeoutForDeadline(startedAt, config) {
  const attempts = Math.min(2, Math.max(1, Number(config.providerAttempts || 1)));
  const retryDelayTotalMs = Math.max(0, Number(config.retryDelayMs || 0)) * ((attempts - 1) * attempts) / 2;
  const remaining = config.studyActionTimeoutMs - (Date.now() - startedAt);
  if (remaining <= retryDelayTotalMs + attempts * 1000) {
    throw new AiTutorStudyError('STUDY_ACTION_TIMEOUT');
  }
  return Math.min(
    config.studyProviderTimeoutMs,
    Math.floor((remaining - retryDelayTotalMs) / attempts)
  );
}

export class AiTutorStudyService {
  constructor({ config, repository, baseRepository, documentService, provider, now = () => new Date(), logger = console }) {
    this.config = config;
    this.repository = repository;
    this.baseRepository = baseRepository;
    this.documentService = documentService;
    this.provider = provider;
    this.now = now;
    this.logger = logger;
  }

  assertEnabled() {
    const availability = getAiTutorAvailability(this.config);
    if (!availability.available || !this.config.documentRagEnabled || !this.config.studyToolsEnabled) {
      throw new AiTutorStudyError('STUDY_TOOLS_DISABLED');
    }
  }

  validateSummaryOptions(input) {
    const language = input?.language;
    const length = input?.length;
    const regenerate = input?.regenerate === true;
    if (
      (input?.regenerate !== undefined && typeof input.regenerate !== 'boolean') ||
      !['english', 'urdu', 'roman-urdu'].includes(language) ||
      !['short', 'detailed'].includes(length)
    ) {
      throw new AiTutorStudyError('STUDY_INVALID_OPTIONS');
    }
    return { language, length, regenerate };
  }

  validateQuizOptions(input) {
    const count = input?.count;
    const difficulty = input?.difficulty;
    const language = input?.language;
    if (![5, 10].includes(count) || !['beginner', 'intermediate', 'advanced'].includes(difficulty) || !['english', 'urdu', 'roman-urdu'].includes(language)) {
      throw new AiTutorStudyError('STUDY_INVALID_OPTIONS');
    }
    return { count, difficulty, language };
  }

  validateFlashcardOptions(input) {
    const count = input?.count;
    const language = input?.language;
    if (![10, 20].includes(count) || !['english', 'urdu', 'roman-urdu'].includes(language)) {
      throw new AiTutorStudyError('STUDY_INVALID_OPTIONS');
    }
    return { count, language };
  }

  async prepare(owner, documentId) {
    this.assertEnabled();
    const document = await this.documentService.getReady(owner, documentId);
    if (!(await this.baseRepository.hasConsent(owner, this.config.consentVersion))) {
      throw new AiTutorStudyError('STUDY_CONSENT_REQUIRED');
    }
    const chunks = await this.repository.loadChunks(owner, documentId, document.embeddingVersion, this.config.documentMaxChunks + 1);
    if (!chunks.length || chunks.length > this.config.documentMaxChunks) throw new AiTutorStudyError('STUDY_DOCUMENT_CHANGED');
    return { document, chunks };
  }

  async assertCurrentDocument(owner, documentId, embeddingVersion) {
    try {
      const current = await this.documentService.getReady(owner, documentId);
      if (current.embeddingVersion !== embeddingVersion) throw new Error('version changed');
      return current;
    } catch {
      throw new AiTutorStudyError('STUDY_DOCUMENT_CHANGED');
    }
  }

  async workspace(owner, documentId) {
    const { document } = await this.prepare(owner, documentId);
    const [result, decks] = await Promise.all([
      this.repository.listWorkspace(owner, documentId),
      this.repository.listDecks(owner, documentId, this.now()),
    ]);
    const currentQuizzes = result.quizzes.filter((item) => item.embeddingVersion === document.embeddingVersion);
    const currentQuizIds = new Set(currentQuizzes.map(idOf));
    return {
      documentVersion: document.embeddingVersion,
      summaries: result.summaries.filter((item) => item.embeddingVersion === document.embeddingVersion).map(publicSummary),
      quizzes: currentQuizzes.map(publicQuiz),
      attempts: result.attempts.filter((item) => currentQuizIds.has(idOf(item.quiz))).map((item) => ({
        id: idOf(item), quizId: idOf(item.quiz), status: item.status, score: item.status === 'submitted' ? item.score : null,
        totalQuestions: item.totalQuestions, updatedAt: item.updatedAt,
      })),
      decks: decks.filter((item) => item.embeddingVersion === document.embeddingVersion).map(publicDeck),
    };
  }

  async duplicate(request, action, fingerprint) {
    if (request.action !== action || request.fingerprint !== fingerprint) throw new AiTutorStudyError('STUDY_REQUEST_CONFLICT');
    if (request.status === 'completed') {
      const hydrated = await this.repository.hydrateRequest(request);
      return {
        duplicate: true,
        usage: request.usage,
        ...(action === 'summary'
          ? { summary: publicSummary(hydrated.summary) }
          : action === 'quiz'
            ? { quiz: publicQuiz(hydrated.quiz) }
            : { deck: publicDeck(hydrated.deck) }),
      };
    }
    if (request.status === 'failed' || request.status === 'rejected') throw new AiTutorStudyError(request.safeErrorCode || 'STUDY_RESPONSE_INVALID');
    throw new AiTutorStudyError('STUDY_REQUEST_IN_PROGRESS');
  }

  async admit({ owner, document, action, options, clientRequestId, reservation }) {
    const fingerprint = optionsFingerprint(action, document._id || document.id, document.embeddingVersion, options);
    const claim = await this.repository.claimRequest({ owner, document: document._id || document.id, clientRequestId, action, fingerprint });
    if (!claim.created) return { duplicate: await this.duplicate(claim.request, action, fingerprint) };
    const requestId = idOf(claim.request);
    const attempts = Math.min(2, Math.max(1, Number(this.config.providerAttempts || 1)));
    const retryDelayTotalMs = Math.max(0, Number(this.config.retryDelayMs || 0)) * ((attempts - 1) * attempts) / 2;
    const logicalCalls = reservation.logicalCalls || Math.max(1, Math.ceil(reservation.calls / attempts));
    const maximumProviderDuration =
      reservation.calls * this.config.studyProviderTimeoutMs + logicalCalls * retryDelayTotalMs;
    // Even a deliberately small action deadline must never let the distributed
    // lock expire while an already-started provider attempt can still finish.
    const lockTtl = Math.max(this.config.studyActionTimeoutMs, maximumProviderDuration) + 30000;
    if (!(await this.baseRepository.acquireLock(owner, clientRequestId, lockTtl))) {
      await this.repository.updateRequest(requestId, { status: 'rejected', safeErrorCode: 'STUDY_GENERATION_IN_PROGRESS' });
      throw new AiTutorStudyError('STUDY_GENERATION_IN_PROGRESS');
    }
    try {
      if (!(await this.repository.reserveBudget(reservation, this.config, this.now()))) {
        await this.repository.updateRequest(requestId, { status: 'rejected', safeErrorCode: 'STUDY_BUDGET_LIMIT' });
        throw new AiTutorStudyError('STUDY_BUDGET_LIMIT');
      }
      const usageClaim = await this.baseRepository.reserveUsage(owner, this.config, this.now());
      if (!usageClaim.admitted) {
        await this.repository.updateRequest(requestId, { status: 'rejected', safeErrorCode: usageClaim.reason, usage: usageClaim.usage, reservedBudget: reservation });
        throw new AiTutorStudyError(usageClaim.reason, { usage: usageClaim.usage });
      }
      await this.repository.updateRequest(requestId, { status: 'admitted', usage: usageClaim.usage, reservedBudget: reservation });
      return { requestId, usage: usageClaim.usage, release: true };
    } catch (error) {
      if (!(error instanceof AiTutorStudyError)) {
        await this.repository.updateRequest(requestId, { status: 'failed', safeErrorCode: 'STUDY_RESPONSE_INVALID' });
      }
      await this.baseRepository.releaseLock(owner, clientRequestId);
      throw error;
    }
  }

  async generateSummary({ owner, documentId, clientRequestId, input }) {
    const options = this.validateSummaryOptions(input);
    const { document, chunks } = await this.prepare(owner, documentId);
    const optionsKey = `${options.language}:${options.length}`;
    const fingerprint = optionsFingerprint('summary', document._id || document.id, document.embeddingVersion, options);
    const existingRequest = await this.repository.findRequest(owner, clientRequestId);
    if (existingRequest) return this.duplicate(existingRequest, 'summary', fingerprint);
    if (!options.regenerate) {
      const cached = await this.repository.findSummary(owner, documentId, document.embeddingVersion, optionsKey);
      if (cached) {
        const claim = await this.repository.claimRequest({
          owner, document: documentId, clientRequestId, action: 'summary', fingerprint,
        });
        if (!claim.created) return this.duplicate(claim.request, 'summary', fingerprint);
        const usage = await this.baseRepository.getUsage(owner, this.config, this.now());
        await this.repository.updateRequest(idOf(claim.request), {
          status: 'completed', summary: cached._id || cached.id,
          usage,
        });
        return { duplicate: false, cached: true, summary: publicSummary(cached), usage };
      }
    }
    const plan = planSummaryCoverage(chunks, this.config);
    const inputChars = plan.batches.reduce((sum, batch) => sum + materialForSources(batch).length, 0) + (plan.consolidate ? this.config.studyMaxIntermediateChars : 0);
    const attempts = Math.min(2, Math.max(1, Number(this.config.providerAttempts || 1)));
    const reservation = {
      calls: plan.calls * attempts,
      logicalCalls: plan.calls,
      inputTokens: estimateTokens(inputChars) * attempts,
      outputTokens: plan.calls * this.config.studySummaryOutputTokens * attempts,
    };
    const admitted = await this.admit({ owner, document, action: 'summary', options, clientRequestId, reservation });
    if (admitted.duplicate) return admitted.duplicate;
    const started = Date.now();
    try {
      const partials = [];
      for (const batch of plan.batches) {
        const material = materialForSources(batch);
        partials.push(validateSummary(await this.provider.generateStudySummary({
          material, sourceIds: batch.map((item) => item.sourceId), language: options.language,
          length: options.length, stage: plan.consolidate ? 'section' : 'final',
          maxOutputTokens: this.config.studySummaryOutputTokens,
          timeoutMs: providerTimeoutForDeadline(started, this.config),
        }), batch, this.config.studyMaxOutputChars));
      }
      let result = partials[0];
      let coverageFull = plan.full;
      let coveredForResult = plan.covered;
      let coverageNote = plan.full
        ? ''
        : `Generated from ${plan.covered.length} of ${chunks.length} indexed sections due to bounded context limits.`;
      if (plan.consolidate) {
        const sections = partials.map((item, index) => `Section ${index + 1} [Sources: ${item.sources.map((source) => source.sourceId).join(', ')}]\n${item.overview}\n${item.keyConcepts.join('\n')}\n${item.importantTerms.map((term) => `${term.term}: ${term.definition}`).join('\n')}`);
        const includedSections = [];
        let intermediateCharacters = 0;
        let intermediateTruncated = false;
        for (const section of sections) {
          const separator = includedSections.length ? 2 : 0;
          if (includedSections.length && intermediateCharacters + separator + section.length > this.config.studyMaxIntermediateChars) break;
          if (!includedSections.length && section.length > this.config.studyMaxIntermediateChars) {
            includedSections.push(section.slice(0, this.config.studyMaxIntermediateChars));
            intermediateCharacters = this.config.studyMaxIntermediateChars;
            intermediateTruncated = true;
            break;
          }
          includedSections.push(section);
          intermediateCharacters += separator + section.length;
        }
        coveredForResult = plan.batches.slice(0, includedSections.length).flat();
        if (includedSections.length < sections.length || intermediateTruncated) {
          coverageFull = false;
          coverageNote = 'Partial summary: the bounded consolidation limit was reached after section processing.';
        }
        const material = includedSections.join('\n\n');
        result = validateSummary(await this.provider.generateStudySummary({
          material, sourceIds: coveredForResult.map((item) => item.sourceId), language: options.language,
          length: options.length, stage: 'consolidation', maxOutputTokens: this.config.studySummaryOutputTokens,
          timeoutMs: providerTimeoutForDeadline(started, this.config),
        }), plan.covered, this.config.studyMaxOutputChars);
      }
      await this.assertCurrentDocument(owner, documentId, document.embeddingVersion);
      const summary = await this.repository.saveSummary({
        owner, document: documentId, embeddingVersion: document.embeddingVersion, optionsKey,
        language: options.language, length: options.length, ...result,
        coverage: {
          status: coverageFull ? 'full' : 'partial', coveredChunkCount: coveredForResult.length,
          totalChunkCount: chunks.length, coveredLocations: [...new Set(coveredForResult.map((item) => item.label))],
          note: coverageNote,
        },
        providerCallCount: plan.calls, generatedAt: this.now(),
      }, options.regenerate);
      try {
        await this.assertCurrentDocument(owner, documentId, document.embeddingVersion);
      } catch (error) {
        await this.repository.deleteSummary(owner, summary._id || summary.id);
        throw error;
      }
      await this.repository.updateRequest(admitted.requestId, { status: 'completed', summary: summary._id || summary.id, safeErrorCode: null });
      return { duplicate: false, cached: false, summary: publicSummary(summary), usage: admitted.usage };
    } catch (error) {
      const code = error instanceof AiTutorStudyError || error instanceof AiTutorProviderError ? error.code : 'STUDY_RESPONSE_INVALID';
      await this.repository.updateRequest(admitted.requestId, { status: 'failed', safeErrorCode: code });
      throw error instanceof AiTutorStudyError ? error : new AiTutorStudyError(code);
    } finally {
      await this.baseRepository.releaseLock(owner, clientRequestId);
    }
  }

  async generateQuiz({ owner, documentId, clientRequestId, input }) {
    const options = this.validateQuizOptions(input);
    const { document, chunks } = await this.prepare(owner, documentId);
    const evidence = selectQuizEvidence(chunks.map(sourceForChunk), this.config.studyQuizMaxEvidenceChunks, this.config.studyQuizContextChars);
    const material = materialForSources(evidence);
    const attempts = Math.min(2, Math.max(1, Number(this.config.providerAttempts || 1)));
    const reservation = {
      calls: attempts,
      logicalCalls: 1,
      inputTokens: estimateTokens(material.length) * attempts,
      outputTokens: this.config.studyQuizOutputTokens * attempts,
    };
    const admitted = await this.admit({ owner, document, action: 'quiz', options, clientRequestId, reservation });
    if (admitted.duplicate) return admitted.duplicate;
    const started = Date.now();
    try {
      const validated = validateQuiz(await this.provider.generateStudyQuiz({
        material, sourceIds: evidence.map((item) => item.sourceId), count: options.count,
        difficulty: options.difficulty, language: options.language,
        maxOutputTokens: this.config.studyQuizOutputTokens,
        timeoutMs: providerTimeoutForDeadline(started, this.config),
      }), evidence, options.count, this.config.studyMaxOutputChars);
      await this.assertCurrentDocument(owner, documentId, document.embeddingVersion);
      const quiz = await this.repository.createQuiz({
        owner, document: documentId, embeddingVersion: document.embeddingVersion,
        requestedCount: options.count, difficulty: options.difficulty, language: options.language,
        ...validated, evidenceChunkCount: evidence.length, generatedAt: this.now(),
      });
      try {
        await this.assertCurrentDocument(owner, documentId, document.embeddingVersion);
      } catch (error) {
        await this.repository.deleteQuiz(owner, quiz._id || quiz.id);
        throw error;
      }
      await this.repository.updateRequest(admitted.requestId, { status: 'completed', quiz: quiz._id || quiz.id, safeErrorCode: null });
      return { duplicate: false, quiz: publicQuiz(quiz), usage: admitted.usage };
    } catch (error) {
      const code = error instanceof AiTutorStudyError || error instanceof AiTutorProviderError ? error.code : 'STUDY_RESPONSE_INVALID';
      await this.repository.updateRequest(admitted.requestId, { status: 'failed', safeErrorCode: code });
      throw error instanceof AiTutorStudyError ? error : new AiTutorStudyError(code);
    } finally {
      await this.baseRepository.releaseLock(owner, clientRequestId);
    }
  }

  async generateFlashcards({ owner, documentId, clientRequestId, input }) {
    const options = this.validateFlashcardOptions(input);
    const { document, chunks } = await this.prepare(owner, documentId);
    const fingerprint = optionsFingerprint('flashcards', document._id || document.id, document.embeddingVersion, options);
    const existingRequest = await this.repository.findRequest(owner, clientRequestId);
    if (existingRequest) return this.duplicate(existingRequest, 'flashcards', fingerprint);

    const capacity = await this.repository.getDeckCapacity(owner, documentId);
    if (
      capacity.userDecks >= this.config.studyMaxDecksPerUser ||
      capacity.documentDecks >= this.config.studyMaxDecksPerDocument ||
      capacity.userCards + options.count > this.config.studyMaxCardsPerUser ||
      capacity.documentCards + options.count > this.config.studyMaxCardsPerDocument
    ) {
      throw new AiTutorStudyError('FLASHCARD_LIMIT');
    }

    const evidence = selectQuizEvidence(
      chunks.map(sourceForChunk),
      this.config.studyFlashcardMaxEvidenceChunks,
      this.config.studyFlashcardContextChars
    );
    const material = materialForSources(evidence);
    const attempts = Math.min(2, Math.max(1, Number(this.config.providerAttempts || 1)));
    const reservation = {
      calls: attempts,
      logicalCalls: 1,
      inputTokens: estimateTokens(material.length) * attempts,
      outputTokens: this.config.studyFlashcardOutputTokens * attempts,
    };
    const admitted = await this.admit({
      owner,
      document,
      action: 'flashcards',
      options,
      clientRequestId,
      reservation,
    });
    if (admitted.duplicate) return admitted.duplicate;
    const started = Date.now();
    try {
      const validated = validateFlashcards(
        await this.provider.generateStudyFlashcards({
          material,
          sourceIds: evidence.map((item) => item.sourceId),
          count: options.count,
          language: options.language,
          maxOutputTokens: this.config.studyFlashcardOutputTokens,
          timeoutMs: providerTimeoutForDeadline(started, this.config),
        }),
        evidence,
        options.count,
        this.config.studyMaxOutputChars
      );
      await this.assertCurrentDocument(owner, documentId, document.embeddingVersion);
      const deck = await this.repository.createDeckWithStates({
        owner,
        document: documentId,
        embeddingVersion: document.embeddingVersion,
        requestedCount: options.count,
        language: options.language,
        ...validated,
        evidenceChunkCount: evidence.length,
        generatedAt: this.now(),
      });
      try {
        await this.assertCurrentDocument(owner, documentId, document.embeddingVersion);
      } catch (error) {
        await this.repository.deleteDeckArtifact(owner, deck._id || deck.id);
        throw error;
      }
      await this.repository.updateRequest(admitted.requestId, {
        status: 'completed',
        deck: deck._id || deck.id,
        safeErrorCode: null,
      });
      return { duplicate: false, deck: publicDeck(deck), usage: admitted.usage };
    } catch (error) {
      const code = error instanceof AiTutorStudyError || error instanceof AiTutorProviderError
        ? error.code
        : 'STUDY_RESPONSE_INVALID';
      await this.repository.updateRequest(admitted.requestId, { status: 'failed', safeErrorCode: code });
      throw error instanceof AiTutorStudyError ? error : new AiTutorStudyError(code);
    } finally {
      await this.baseRepository.releaseLock(owner, clientRequestId);
    }
  }

  async getCurrentDeck(owner, deckId) {
    this.assertEnabled();
    const deck = await this.repository.findDeck(owner, deckId);
    if (!deck) throw new AiTutorStudyError('DECK_NOT_FOUND');
    await this.assertCurrentDocument(owner, deck.document, deck.embeddingVersion);
    return deck;
  }

  async deleteDeck(owner, deckId) {
    this.assertEnabled();
    const deleted = await this.repository.deleteDeck(owner, deckId);
    if (!deleted) throw new AiTutorStudyError('DECK_NOT_FOUND');
    return { deleted: true, deckId: idOf(deleted) };
  }

  async startReviewSession(owner, deckId, mode) {
    if (!['scheduled', 'extra'].includes(mode)) throw new AiTutorStudyError('INVALID_REVIEW');
    const deck = await this.getCurrentDeck(owner, deckId);
    const active = await this.repository.findActiveSession(owner, deckId, mode);
    if (active) {
      const state = active.status === 'active'
        ? await this.repository.findReviewState(owner, deckId, active.queue[active.currentIndex])
        : null;
      return { resumed: true, session: publicReviewSession(active, deck, state) };
    }
    const states = await this.repository.listReviewStates(owner, deckId);
    const now = this.now();
    const queue = mode === 'extra'
      ? states.map((state) => state.card)
      : states
          .filter((state) => state.reviewCount === 0 || (state.nextDueAt && state.nextDueAt <= now))
          .sort((left, right) => {
            if (left.reviewCount === 0 && right.reviewCount !== 0) return 1;
            if (right.reviewCount === 0 && left.reviewCount !== 0) return -1;
            return new Date(left.nextDueAt || 8640000000000000) - new Date(right.nextDueAt || 8640000000000000);
          })
          .map((state) => state.card);
    const session = await this.repository.createSession({
      owner,
      document: deck.document,
      deck: deckId,
      mode,
      queue,
      status: queue.length ? 'active' : 'completed',
      completedAt: queue.length ? null : now,
      startedAt: now,
    });
    const state = queue.length ? await this.repository.findReviewState(owner, deckId, queue[0]) : null;
    return { resumed: false, session: publicReviewSession(session, deck, state) };
  }

  async getReviewSession(owner, sessionId, reveal = false) {
    this.assertEnabled();
    const session = await this.repository.findSession(owner, sessionId);
    if (!session) throw new AiTutorStudyError('REVIEW_SESSION_NOT_FOUND');
    const deck = await this.getCurrentDeck(owner, session.deck);
    const cardId = session.status === 'active' ? session.queue[session.currentIndex] : null;
    const state = cardId ? await this.repository.findReviewState(owner, session.deck, cardId) : null;
    return { session: publicReviewSession(session, deck, state, reveal) };
  }

  async rateFlashcard(owner, sessionId, input) {
    const eventId = clean(input?.eventId);
    const rating = input?.rating;
    const expectedStateVersion = Number(input?.expectedStateVersion);
    const expectedSessionVersion = Number(input?.expectedSessionVersion);
    if (
      !/^[A-Za-z0-9_-]{12,80}$/.test(eventId) ||
      !['again', 'hard', 'remembered'].includes(rating) ||
      !Number.isInteger(expectedStateVersion) || expectedStateVersion < 0 ||
      !Number.isInteger(expectedSessionVersion) || expectedSessionVersion < 0
    ) throw new AiTutorStudyError('INVALID_REVIEW');

    const session = await this.repository.findSession(owner, sessionId);
    if (!session) throw new AiTutorStudyError('REVIEW_SESSION_NOT_FOUND');
    if (session.completedEventIds?.includes(eventId)) {
      const deck = await this.getCurrentDeck(owner, session.deck);
      const nextCardId = session.status === 'active' ? session.queue[session.currentIndex] : null;
      const nextState = nextCardId
        ? await this.repository.findReviewState(owner, session.deck, nextCardId)
        : null;
      return { duplicate: true, session: publicReviewSession(session, deck, nextState) };
    }
    if (session.status !== 'active') {
      throw new AiTutorStudyError('REVIEW_SESSION_COMPLETE');
    }
    const deck = await this.getCurrentDeck(owner, session.deck);
    const cardId = session.queue[session.currentIndex];
    const current = await this.repository.findReviewState(owner, session.deck, cardId);
    if (!current) throw new AiTutorStudyError('REVIEW_SESSION_NOT_FOUND');
    const previouslyAppliedEvent = current.recentEvents?.find((item) => item.eventId === eventId);
    const eventAlreadyApplied = Boolean(previouslyAppliedEvent);
    if (
      previouslyAppliedEvent &&
      (previouslyAppliedEvent.rating !== rating || previouslyAppliedEvent.mode !== session.mode)
    ) {
      throw new AiTutorStudyError('REVIEW_CONFLICT');
    }
    if (
      session.version !== expectedSessionVersion ||
      (!eventAlreadyApplied && current.version !== expectedStateVersion)
    ) {
      throw new AiTutorStudyError('REVIEW_CONFLICT');
    }
    const now = this.now();
    const schedule = scheduleFlashcardReview(current, rating, session.mode, now);
    const event = {
      eventId,
      mode: session.mode,
      rating,
      reviewedAt: now,
      previousStage: current.intervalStage || 0,
      nextStage: schedule.intervalStage,
      previousNextDueAt: current.nextDueAt || null,
      nextDueAt: schedule.nextDueAt,
    };
    const reviewed = await this.repository.applyReview({
      owner,
      deckId: session.deck,
      cardId,
      expectedVersion: expectedStateVersion,
      event,
      schedule,
      retention: this.config.studyReviewEventRetention,
    });
    if (!reviewed.state) throw new AiTutorStudyError('REVIEW_SESSION_NOT_FOUND');
    if (reviewed.conflict) throw new AiTutorStudyError('REVIEW_CONFLICT');
    const advanced = await this.repository.advanceSession({
      owner,
      sessionId,
      eventId,
      expectedVersion: expectedSessionVersion,
      expectedIndex: session.currentIndex,
      completedAt: now,
    });
    if (!advanced.session) throw new AiTutorStudyError('REVIEW_SESSION_NOT_FOUND');
    if (advanced.conflict) throw new AiTutorStudyError('REVIEW_CONFLICT');
    const nextCardId = advanced.session.status === 'active'
      ? advanced.session.queue[advanced.session.currentIndex]
      : null;
    const nextState = nextCardId
      ? await this.repository.findReviewState(owner, session.deck, nextCardId)
      : null;
    return {
      duplicate: reviewed.duplicate || advanced.duplicate,
      schedule: {
        nextDueAt: reviewed.state.nextDueAt,
        intervalStage: reviewed.state.intervalStage,
        extraPractice: session.mode === 'extra',
      },
      session: publicReviewSession(advanced.session, deck, nextState),
    };
  }

  async flashcardSource(owner, deckId, cardId, chunkId) {
    this.assertEnabled();
    const result = await this.repository.getFlashcardSource(owner, deckId, cardId, chunkId);
    if (!result) throw new AiTutorStudyError('STUDY_NOT_FOUND');
    if (result.document.embeddingVersion !== result.deck.embeddingVersion) {
      throw new AiTutorStudyError('STUDY_DOCUMENT_CHANGED');
    }
    return {
      sourceId: result.source.sourceId,
      filename: result.document.displayName,
      fileType: result.document.fileType,
      label: result.source.label,
      excerpt: result.chunk.text,
      location: result.chunk.source,
    };
  }

  async progress(owner, timezone = 'UTC') {
    this.assertEnabled();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new AiTutorStudyError('INVALID_TIMEZONE');
    }
    const now = this.now();
    const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.repository.progress(owner, {
      now, since7, since30, timezone, attemptLimit: this.config.studyProgressAttemptLimit,
    });
    const totals = result.activity.totals?.[0] || {};
    return {
      timezone,
      generatedAt: now,
      flashcards: {
        totalDecks: result.deckTotals.totalDecks || 0,
        totalCards: result.deckTotals.totalCards || 0,
        neverReviewed: result.neverReviewed,
        currentlyDue: result.due,
        scheduledCompleted7Days: totals.scheduled7 || 0,
        scheduledCompleted30Days: totals.scheduled30 || 0,
        extraPractice7Days: totals.extra7 || 0,
        extraPractice30Days: totals.extra30 || 0,
        dailyActivity: (result.activity.days || []).map((item) => ({
          date: item._id.date,
          mode: item._id.mode,
          count: item.count,
        })),
      },
      recentQuizAttempts: result.attempts.map((attempt) => {
        const quiz = result.quizMap.get(String(attempt.quiz));
        return {
          id: idOf(attempt),
          quizId: idOf(attempt.quiz),
          score: attempt.score,
          questionCount: attempt.totalQuestions,
          difficulty: quiz?.difficulty,
          language: quiz?.language,
          submittedAt: attempt.submittedAt,
          attemptNumber: attempt.attemptNumber,
          isRetake: attempt.attemptNumber > 1,
        };
      }),
      note: 'Flashcard scheduling is a revision aid, not a scientifically validated mastery score.',
    };
  }

  async startAttempt(owner, quizId) {
    this.assertEnabled();
    const quiz = await this.repository.findQuiz(owner, quizId);
    if (!quiz) throw new AiTutorStudyError('STUDY_NOT_FOUND');
    const document = await this.documentService.getReady(owner, quiz.document);
    if (document.embeddingVersion !== quiz.embeddingVersion) throw new AiTutorStudyError('STUDY_DOCUMENT_CHANGED');
    const attempt = await this.repository.createAttempt({ owner, document: quiz.document, quiz: quizId, totalQuestions: quiz.questions.length });
    return { attempt: publicAttempt(attempt, quiz) };
  }

  async getAttempt(owner, attemptId) {
    this.assertEnabled();
    const attempt = await this.repository.findAttempt(owner, attemptId);
    if (!attempt) throw new AiTutorStudyError('ATTEMPT_NOT_FOUND');
    const quiz = await this.repository.findQuiz(owner, attempt.quiz);
    if (!quiz) throw new AiTutorStudyError('ATTEMPT_NOT_FOUND');
    await this.assertCurrentDocument(owner, quiz.document, quiz.embeddingVersion);
    return { attempt: publicAttempt(attempt, quiz) };
  }

  async saveAnswer(owner, attemptId, questionIndex, selectedOptionIndex) {
    const { attempt: current } = await this.getAttempt(owner, attemptId);
    if (current.status === 'submitted') throw new AiTutorStudyError('ATTEMPT_SUBMITTED');
    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= current.totalQuestions || !Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0 || selectedOptionIndex > 3) {
      throw new AiTutorStudyError('INVALID_ANSWER');
    }
    const attempt = await this.repository.saveAnswer(owner, attemptId, questionIndex, selectedOptionIndex);
    if (!attempt) throw new AiTutorStudyError('ATTEMPT_SUBMITTED');
    const quiz = await this.repository.findQuiz(owner, attempt.quiz);
    return { attempt: publicAttempt(attempt, quiz) };
  }

  async submitAttempt(owner, attemptId) {
    this.assertEnabled();
    const attempt = await this.repository.findAttempt(owner, attemptId);
    if (!attempt) throw new AiTutorStudyError('ATTEMPT_NOT_FOUND');
    const quiz = await this.repository.findQuiz(owner, attempt.quiz);
    if (!quiz) throw new AiTutorStudyError('ATTEMPT_NOT_FOUND');
    await this.assertCurrentDocument(owner, quiz.document, quiz.embeddingVersion);
    if (attempt.status === 'submitted') return { duplicate: true, attempt: publicAttempt(attempt, quiz) };
    const answers = new Map((attempt.answers || []).map((answer) => [answer.questionIndex, answer.selectedOptionIndex]));
    const correctCount = quiz.questions.reduce((score, question, index) => score + (answers.get(index) === question.correctIndex ? 1 : 0), 0);
    const grading = { correctCount, totalQuestions: quiz.questions.length, score: Math.round((correctCount / quiz.questions.length) * 100) };
    const submitted = await this.repository.submitAttempt(owner, attemptId, grading);
    if (!submitted) {
      const existing = await this.repository.findAttempt(owner, attemptId);
      return { duplicate: true, attempt: publicAttempt(existing, quiz) };
    }
    return { duplicate: false, attempt: publicAttempt(submitted, quiz) };
  }

  async summarySource(owner, summaryId, chunkId) {
    this.assertEnabled();
    const result = await this.repository.getSummarySource(owner, summaryId, chunkId);
    if (!result) throw new AiTutorStudyError('STUDY_NOT_FOUND');
    if (result.document.embeddingVersion !== result.artifact.embeddingVersion) {
      throw new AiTutorStudyError('STUDY_DOCUMENT_CHANGED');
    }
    return {
      sourceId: result.source.sourceId,
      filename: result.document.displayName,
      fileType: result.document.fileType,
      label: result.source.label,
      excerpt: result.chunk.text,
      location: result.chunk.source,
    };
  }

  async attemptSource(owner, attemptId, questionIndex, chunkId) {
    this.assertEnabled();
    const result = await this.repository.getAttemptSource(owner, attemptId, questionIndex, chunkId);
    if (!result) throw new AiTutorStudyError('STUDY_NOT_FOUND');
    if (result.document.embeddingVersion !== result.artifact.embeddingVersion) {
      throw new AiTutorStudyError('STUDY_DOCUMENT_CHANGED');
    }
    return {
      sourceId: result.source.sourceId,
      filename: result.document.displayName,
      fileType: result.document.fileType,
      label: result.source.label,
      excerpt: result.chunk.text,
      location: result.chunk.source,
    };
  }
}

export {
  STUDY_ERRORS,
  materialForSources,
  publicAttempt,
  publicDeck,
  publicQuiz,
  publicSummary,
  providerTimeoutForDeadline,
  selectQuizEvidence,
  validateQuiz,
  validateFlashcards,
  validateSummary,
};
