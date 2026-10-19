import AiTutorDocumentChunk from '../models/AiTutorDocumentChunk.js';
import AiTutorQuiz from '../models/AiTutorQuiz.js';
import AiTutorQuizAttempt from '../models/AiTutorQuizAttempt.js';
import AiTutorStudyRequest from '../models/AiTutorStudyRequest.js';
import AiTutorStudyUsage from '../models/AiTutorStudyUsage.js';
import AiTutorSummary from '../models/AiTutorSummary.js';
import AiTutorDocument from '../models/AiTutorDocument.js';
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
    const [summary, quiz] = await Promise.all([
      request.summary ? AiTutorSummary.findById(request.summary).lean() : null,
      request.quiz ? AiTutorQuiz.findById(request.quiz).lean() : null,
    ]);
    return { ...request, summary, quiz };
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
