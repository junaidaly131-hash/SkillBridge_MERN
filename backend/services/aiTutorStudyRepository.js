import mongoose from 'mongoose';
import AiTutorDocumentChunk from '../models/AiTutorDocumentChunk.js';
import AiTutorQuiz from '../models/AiTutorQuiz.js';
import AiTutorQuizAttempt from '../models/AiTutorQuizAttempt.js';
import AiTutorStudyRequest from '../models/AiTutorStudyRequest.js';
import AiTutorStudyUsage from '../models/AiTutorStudyUsage.js';
import AiTutorSummary from '../models/AiTutorSummary.js';
import AiTutorDocument from '../models/AiTutorDocument.js';
import AiTutorFlashcardDeck from '../models/AiTutorFlashcardDeck.js';
import AiTutorFlashcardReviewState from '../models/AiTutorFlashcardReviewState.js';
import AiTutorFlashcardSession from '../models/AiTutorFlashcardSession.js';
import { utcBucket } from './aiTutorRepository.js';

const isDuplicateKey = (error) => error?.code === 11000;

export class MongoAiTutorStudyRepository {
  async claimRequest(data) {
    try {
      return { created: true, request: await AiTutorStudyRequest.create(data) };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return {
        created: false,
        request: await AiTutorStudyRequest.findOne({
          owner: data.owner,
          clientRequestId: data.clientRequestId,
        }).lean(),
      };
    }
  }

  findRequest(owner, clientRequestId) {
    return AiTutorStudyRequest.findOne({ owner, clientRequestId }).lean();
  }

  updateRequest(requestId, update) {
    return AiTutorStudyRequest.findByIdAndUpdate(requestId, { $set: update }, { new: true }).lean();
  }

  async hydrateRequest(request) {
    if (!request) return null;
    const [summary, quiz, deck] = await Promise.all([
      request.summary ? AiTutorSummary.findById(request.summary).lean() : null,
      request.quiz ? AiTutorQuiz.findById(request.quiz).lean() : null,
      request.deck ? AiTutorFlashcardDeck.findById(request.deck).lean() : null,
    ]);
    return { ...request, summary, quiz, deck };
  }

  loadChunks(owner, documentId, embeddingVersion, limit) {
    return AiTutorDocumentChunk.find({ owner, document: documentId, embeddingVersion })
      .sort({ ordinal: 1 })
      .limit(limit)
      .select('-embedding')
      .lean();
  }

  findSummary(owner, documentId, embeddingVersion, optionsKey) {
    return AiTutorSummary.findOne({ owner, document: documentId, embeddingVersion, optionsKey }).lean();
  }

  async saveSummary(data, replace = false) {
    if (replace) {
      return AiTutorSummary.findOneAndUpdate(
        {
          owner: data.owner,
          document: data.document,
          embeddingVersion: data.embeddingVersion,
          optionsKey: data.optionsKey,
        },
        { $set: data },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
    }
    try {
      const summary = await AiTutorSummary.create(data);
      return summary.toObject();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return this.findSummary(data.owner, data.document, data.embeddingVersion, data.optionsKey);
    }
  }

  deleteSummary(owner, summaryId) {
    return AiTutorSummary.deleteOne({ _id: summaryId, owner });
  }

  async listWorkspace(owner, documentId) {
    const [summaries, quizzes, attempts] = await Promise.all([
      AiTutorSummary.find({ owner, document: documentId }).sort({ generatedAt: -1 }).lean(),
      AiTutorQuiz.find({ owner, document: documentId })
        .sort({ generatedAt: -1 })
        .select('-questions.correctIndex -questions.explanation -questions.sources')
        .lean(),
      AiTutorQuizAttempt.find({ owner, document: documentId }).sort({ updatedAt: -1 }).lean(),
    ]);
    return { summaries, quizzes, attempts };
  }

  async createQuiz(data) {
    const quiz = await AiTutorQuiz.create(data);
    return quiz.toObject();
  }

  deleteQuiz(owner, quizId) {
    return AiTutorQuiz.deleteOne({ _id: quizId, owner });
  }

  async getDeckCapacity(owner, documentId) {
    const [user] = await AiTutorFlashcardDeck.aggregate([
      { $match: { owner: new mongoose.Types.ObjectId(String(owner)) } },
      { $group: { _id: null, decks: { $sum: 1 }, cards: { $sum: { $size: '$cards' } } } },
    ]);
    const [document] = await AiTutorFlashcardDeck.aggregate([
      {
        $match: {
          owner: new mongoose.Types.ObjectId(String(owner)),
          document: new mongoose.Types.ObjectId(String(documentId)),
        },
      },
      { $group: { _id: null, decks: { $sum: 1 }, cards: { $sum: { $size: '$cards' } } } },
    ]);
    return {
      userDecks: user?.decks || 0,
      userCards: user?.cards || 0,
      documentDecks: document?.decks || 0,
      documentCards: document?.cards || 0,
    };
  }

  async createDeckWithStates(data) {
    let deck;
    try {
      deck = await AiTutorFlashcardDeck.create(data);
      await AiTutorFlashcardReviewState.insertMany(
        deck.cards.map((card) => ({
          owner: data.owner,
          document: data.document,
          deck: deck._id,
          card: card._id,
        }))
      );
      return deck.toObject();
    } catch (error) {
      if (deck) {
        await AiTutorFlashcardReviewState.deleteMany({ owner: data.owner, deck: deck._id });
        await AiTutorFlashcardDeck.deleteOne({ _id: deck._id, owner: data.owner });
      }
      throw error;
    }
  }

  findDeck(owner, deckId) {
    return AiTutorFlashcardDeck.findOne({ _id: deckId, owner }).lean();
  }

  async listDecks(owner, documentId, now = new Date()) {
    const decks = await AiTutorFlashcardDeck.find({ owner, document: documentId })
      .sort({ generatedAt: -1 })
      .lean();
    if (!decks.length) return [];
    const counts = await AiTutorFlashcardReviewState.aggregate([
      { $match: { owner: decks[0].owner, deck: { $in: decks.map((deck) => deck._id) } } },
      {
        $group: {
          _id: '$deck',
          newCount: { $sum: { $cond: [{ $eq: ['$reviewCount', 0] }, 1, 0] } },
          dueCount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$reviewCount', 0] }, { $lte: ['$nextDueAt', now] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const byDeck = new Map(counts.map((item) => [String(item._id), item]));
    return decks.map((deck) => ({ ...deck, reviewCounts: byDeck.get(String(deck._id)) || { newCount: 0, dueCount: 0 } }));
  }

  async deleteDeck(owner, deckId) {
    const deck = await AiTutorFlashcardDeck.findOne({ _id: deckId, owner }).lean();
    if (!deck) return null;
    await AiTutorFlashcardSession.deleteMany({ owner, deck: deckId });
    await AiTutorFlashcardReviewState.deleteMany({ owner, deck: deckId });
    await AiTutorStudyRequest.deleteMany({ owner, deck: deckId });
    await AiTutorFlashcardDeck.deleteOne({ _id: deckId, owner });
    return deck;
  }

  deleteDeckArtifact(owner, deckId) {
    return this.deleteDeck(owner, deckId);
  }

  listReviewStates(owner, deckId) {
    return AiTutorFlashcardReviewState.find({ owner, deck: deckId })
      .sort({ nextDueAt: 1, card: 1 })
      .lean();
  }

  findReviewState(owner, deckId, cardId) {
    return AiTutorFlashcardReviewState.findOne({ owner, deck: deckId, card: cardId }).lean();
  }

  findActiveSession(owner, deckId, mode) {
    return AiTutorFlashcardSession.findOne({ owner, deck: deckId, mode, status: 'active' }).lean();
  }

  async createSession(data) {
    try {
      const session = await AiTutorFlashcardSession.create(data);
      return session.toObject();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return this.findActiveSession(data.owner, data.deck, data.mode);
    }
  }

  findSession(owner, sessionId) {
    return AiTutorFlashcardSession.findOne({ _id: sessionId, owner }).lean();
  }

  async applyReview({ owner, deckId, cardId, expectedVersion, event, schedule, retention }) {
    const update = {
      $set: {
        nextDueAt: schedule.nextDueAt,
        intervalStage: schedule.intervalStage,
        latestRating: event.rating,
        latestReviewedAt: event.reviewedAt,
      },
      $inc: {
        version: 1,
        reviewCount: 1,
        ...(event.mode === 'scheduled' ? { scheduledReviewCount: 1 } : { extraPracticeCount: 1 }),
      },
      $push: { recentEvents: { $each: [event], $slice: -retention } },
    };
    const state = await AiTutorFlashcardReviewState.findOneAndUpdate(
      {
        owner,
        deck: deckId,
        card: cardId,
        version: expectedVersion,
        'recentEvents.eventId': { $ne: event.eventId },
      },
      update,
      { new: true }
    ).lean();
    if (state) return { state, duplicate: false };
    const current = await this.findReviewState(owner, deckId, cardId);
    const duplicate = Boolean(current?.recentEvents?.some((item) => item.eventId === event.eventId));
    return { state: current, duplicate, conflict: Boolean(current && !duplicate) };
  }

  async advanceSession({ owner, sessionId, eventId, expectedVersion, expectedIndex, completedAt }) {
    const session = await AiTutorFlashcardSession.findOne({ _id: sessionId, owner }).lean();
    if (!session) return { session: null, duplicate: false, conflict: false };
    if (session.completedEventIds?.includes(eventId)) return { session, duplicate: true, conflict: false };
    const nextIndex = expectedIndex + 1;
    const completed = nextIndex >= session.queue.length;
    const updated = await AiTutorFlashcardSession.findOneAndUpdate(
      {
        _id: sessionId,
        owner,
        status: 'active',
        version: expectedVersion,
        currentIndex: expectedIndex,
        completedEventIds: { $ne: eventId },
      },
      {
        $set: {
          currentIndex: nextIndex,
          status: completed ? 'completed' : 'active',
          completedAt: completed ? completedAt : null,
        },
        $inc: { version: 1 },
        $addToSet: { completedEventIds: eventId },
      },
      { new: true }
    ).lean();
    if (updated) return { session: updated, duplicate: false, conflict: false };
    const current = await this.findSession(owner, sessionId);
    return {
      session: current,
      duplicate: Boolean(current?.completedEventIds?.includes(eventId)),
      conflict: Boolean(current && !current.completedEventIds?.includes(eventId)),
    };
  }

  async getFlashcardSource(owner, deckId, cardId, chunkId) {
    const deck = await AiTutorFlashcardDeck.findOne({
      _id: deckId,
      owner,
      'cards._id': cardId,
      'cards.sources.chunk': chunkId,
    }).lean();
    const card = deck?.cards?.find((item) => String(item._id) === String(cardId));
    const source = card?.sources?.find((item) => String(item.chunk) === String(chunkId));
    if (!deck || !card || !source) return null;
    const [document, chunk] = await Promise.all([
      AiTutorDocument.findOne({ _id: deck.document, owner, status: 'ready' }).lean(),
      AiTutorDocumentChunk.findOne({ _id: chunkId, owner, document: deck.document }).lean(),
    ]);
    if (!document || !chunk) return null;
    return { deck, document, chunk, source };
  }

  async progress(owner, { now, since7, since30, timezone, attemptLimit }) {
    const ownerId = new mongoose.Types.ObjectId(String(owner));
    const [deckTotals, neverReviewed, due, activity, attempts] = await Promise.all([
      AiTutorFlashcardDeck.aggregate([
        { $match: { owner: ownerId } },
        { $group: { _id: null, totalDecks: { $sum: 1 }, totalCards: { $sum: { $size: '$cards' } } } },
      ]),
      AiTutorFlashcardReviewState.countDocuments({ owner, reviewCount: 0 }),
      AiTutorFlashcardReviewState.countDocuments({ owner, reviewCount: { $gt: 0 }, nextDueAt: { $lte: now } }),
      AiTutorFlashcardReviewState.aggregate([
        { $match: { owner: ownerId, 'recentEvents.reviewedAt': { $gte: since30 } } },
        { $unwind: '$recentEvents' },
        { $match: { 'recentEvents.reviewedAt': { $gte: since30 } } },
        {
          $facet: {
            totals: [{
              $group: {
                _id: null,
                scheduled30: { $sum: { $cond: [{ $eq: ['$recentEvents.mode', 'scheduled'] }, 1, 0] } },
                scheduled7: { $sum: { $cond: [{ $and: [{ $eq: ['$recentEvents.mode', 'scheduled'] }, { $gte: ['$recentEvents.reviewedAt', since7] }] }, 1, 0] } },
                extra30: { $sum: { $cond: [{ $eq: ['$recentEvents.mode', 'extra'] }, 1, 0] } },
                extra7: { $sum: { $cond: [{ $and: [{ $eq: ['$recentEvents.mode', 'extra'] }, { $gte: ['$recentEvents.reviewedAt', since7] }] }, 1, 0] } },
              },
            }],
            days: [
              { $group: { _id: { date: { $dateToString: { date: '$recentEvents.reviewedAt', format: '%Y-%m-%d', timezone } }, mode: '$recentEvents.mode' }, count: { $sum: 1 } } },
              { $sort: { '_id.date': 1 } },
            ],
          },
        },
      ]),
      AiTutorQuizAttempt.find({ owner, status: 'submitted' })
        .sort({ submittedAt: -1 })
        .limit(attemptLimit)
        .lean(),
    ]);
    const quizIds = [...new Set(attempts.map((item) => String(item.quiz)))];
    const quizzes = await AiTutorQuiz.find({ owner, _id: { $in: quizIds } }).select('requestedCount difficulty language questions generatedAt').lean();
    const quizMap = new Map(quizzes.map((quiz) => [String(quiz._id), quiz]));
    const numberedAttempts = await Promise.all(attempts.map(async (attempt) => ({
      ...attempt,
      attemptNumber: 1 + await AiTutorQuizAttempt.countDocuments({
        owner,
        quiz: attempt.quiz,
        startedAt: { $lt: attempt.startedAt },
      }),
    })));
    return { deckTotals: deckTotals[0] || { totalDecks: 0, totalCards: 0 }, neverReviewed, due, activity: activity[0] || { totals: [], days: [] }, attempts: numberedAttempts, quizMap };
  }

  findQuiz(owner, quizId) {
    return AiTutorQuiz.findOne({ _id: quizId, owner }).lean();
  }

  async createAttempt(data) {
    const attempt = await AiTutorQuizAttempt.create(data);
    return attempt.toObject();
  }

  findAttempt(owner, attemptId) {
    return AiTutorQuizAttempt.findOne({ _id: attemptId, owner }).lean();
  }

  async getSummarySource(owner, summaryId, chunkId) {
    const summary = await AiTutorSummary.findOne({
      _id: summaryId,
      owner,
      'sources.chunk': chunkId,
    }).lean();
    if (!summary) return null;
    const [document, chunk] = await Promise.all([
      AiTutorDocument.findOne({ _id: summary.document, owner, status: 'ready' }).lean(),
      AiTutorDocumentChunk.findOne({ _id: chunkId, owner, document: summary.document }).lean(),
    ]);
    if (!document || !chunk) return null;
    const source = summary.sources.find((item) => String(item.chunk) === String(chunkId));
    return { document, chunk, source, artifact: summary };
  }

  async getAttemptSource(owner, attemptId, questionIndex, chunkId) {
    const attempt = await AiTutorQuizAttempt.findOne({ _id: attemptId, owner, status: 'submitted' }).lean();
    if (!attempt) return null;
    const quiz = await AiTutorQuiz.findOne({
      _id: attempt.quiz,
      owner,
      [`questions.${questionIndex}.sources.chunk`]: chunkId,
    }).lean();
    const question = quiz?.questions?.[questionIndex];
    if (!quiz || !question) return null;
    const [document, chunk] = await Promise.all([
      AiTutorDocument.findOne({ _id: quiz.document, owner, status: 'ready' }).lean(),
      AiTutorDocumentChunk.findOne({ _id: chunkId, owner, document: quiz.document }).lean(),
    ]);
    if (!document || !chunk) return null;
    const source = question.sources.find((item) => String(item.chunk) === String(chunkId));
    return { document, chunk, source, artifact: quiz };
  }

  async saveAnswer(owner, attemptId, questionIndex, selectedOptionIndex) {
    return AiTutorQuizAttempt.findOneAndUpdate(
      { _id: attemptId, owner, status: 'in_progress' },
      [
        {
          $set: {
            answers: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$answers', []] },
                    as: 'answer',
                    cond: { $ne: ['$$answer.questionIndex', questionIndex] },
                  },
                },
                [{ questionIndex, selectedOptionIndex }],
              ],
            },
            updatedAt: new Date(),
          },
        },
      ],
      { new: true }
    ).lean();
  }

  submitAttempt(owner, attemptId, grading) {
    return AiTutorQuizAttempt.findOneAndUpdate(
      { _id: attemptId, owner, status: 'in_progress' },
      { $set: { ...grading, status: 'submitted', submittedAt: new Date() } },
      { new: true }
    ).lean();
  }

  async reserveBudget(reservation, config, now = new Date()) {
    const { bucket, resetAt } = utcBucket(now);
    const expiresAt = new Date(resetAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 35);
    try {
      await AiTutorStudyUsage.updateOne(
        { bucket },
        { $setOnInsert: { bucket, providerCalls: 0, inputTokens: 0, outputTokens: 0, expiresAt } },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }

    const document = await AiTutorStudyUsage.findOneAndUpdate(
      {
        bucket,
        $expr: {
          $and: [
            { $lte: [{ $add: ['$providerCalls', reservation.calls] }, config.studyGlobalDailyProviderCalls] },
            { $lte: [{ $add: ['$inputTokens', reservation.inputTokens] }, config.studyGlobalDailyInputTokens] },
            { $lte: [{ $add: ['$outputTokens', reservation.outputTokens] }, config.studyGlobalDailyOutputTokens] },
          ],
        },
      },
      {
        $inc: {
          providerCalls: reservation.calls,
          inputTokens: reservation.inputTokens,
          outputTokens: reservation.outputTokens,
        },
      },
      { new: true }
    ).lean();
    return Boolean(document);
  }
}

export { isDuplicateKey };
