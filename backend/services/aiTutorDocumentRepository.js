import AiTutorConversation from '../models/AiTutorConversation.js';
import AiTutorDocument from '../models/AiTutorDocument.js';
import AiTutorDocumentChunk from '../models/AiTutorDocumentChunk.js';
import AiTutorIngestionLock from '../models/AiTutorIngestionLock.js';
import AiTutorIngestionSlot from '../models/AiTutorIngestionSlot.js';
import AiTutorIngestionUsage from '../models/AiTutorIngestionUsage.js';
import AiTutorMessage from '../models/AiTutorMessage.js';
import AiTutorRequest from '../models/AiTutorRequest.js';
import AiTutorQuiz from '../models/AiTutorQuiz.js';
import AiTutorQuizAttempt from '../models/AiTutorQuizAttempt.js';
import AiTutorStudyRequest from '../models/AiTutorStudyRequest.js';
import AiTutorSummary from '../models/AiTutorSummary.js';
import { utcBucket } from './aiTutorRepository.js';

const isDuplicateKey = (error) => error?.code === 11000;

export class MongoAiTutorDocumentRepository {
  async acquireIngestionLock(owner, token, ttlMs) {
    const now = new Date();
    try {
      const lock = await AiTutorIngestionLock.findOneAndUpdate(
        { owner, $or: [{ expiresAt: { $lte: now } }, { token }] },
        { $set: { token, expiresAt: new Date(now.getTime() + ttlMs) } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return Boolean(lock);
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async releaseIngestionLock(owner, token) {
    await AiTutorIngestionLock.deleteOne({ owner, token });
  }

  async acquireGlobalIngestionSlot(token, slotCount, ttlMs) {
    const now = new Date();
    for (let slot = 0; slot < slotCount; slot += 1) {
      try {
        const claimed = await AiTutorIngestionSlot.findOneAndUpdate(
          { slot, $or: [{ expiresAt: { $lte: now } }, { token }] },
          { $set: { token, expiresAt: new Date(now.getTime() + ttlMs) } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        if (claimed) return slot;
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    }
    return null;
  }

  async releaseGlobalIngestionSlot(token) {
    await AiTutorIngestionSlot.deleteOne({ token });
  }

  async reserveUploadAttempt(owner, config, now = new Date()) {
    const { bucket, resetAt } = utcBucket(now);
    const expiresAt = new Date(resetAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 35);
    try {
      await AiTutorIngestionUsage.updateOne(
        { bucket },
        { $setOnInsert: { bucket, globalCharacters: 0, userAttempts: {}, expiresAt } },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const path = `userAttempts.${String(owner)}`;
    const usage = await AiTutorIngestionUsage.findOneAndUpdate(
      {
        bucket,
        $expr: { $lt: [{ $ifNull: [`$${path}`, 0] }, config.documentDailyUploadAttempts] },
      },
      { $inc: { [path]: 1 } },
      { new: true }
    ).lean();
    return Boolean(usage);
  }

  async reserveEmbeddingCharacters(characterCount, config, now = new Date()) {
    const { bucket } = utcBucket(now);
    const usage = await AiTutorIngestionUsage.findOneAndUpdate(
      {
        bucket,
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$globalCharacters', 0] }, characterCount] },
            config.documentGlobalDailyEmbeddingCharacters,
          ],
        },
      },
      { $inc: { globalCharacters: characterCount } },
      { new: true }
    ).lean();
    return Boolean(usage);
  }

  async recoverStaleProcessing(owner, now = new Date()) {
    const stale = await AiTutorDocument.find({
      owner,
      status: 'processing',
      processingExpiresAt: { $lte: now },
    }).select('_id');
    if (!stale.length) return;
    const ids = stale.map((document) => document._id);
    await AiTutorDocumentChunk.deleteMany({ owner, document: { $in: ids } });
    await AiTutorDocument.updateMany(
      { owner, _id: { $in: ids }, status: 'processing' },
      {
        $set: { status: 'failed', failureCategory: 'PROCESS_RESTARTED' },
        $unset: { processingToken: 1, processingExpiresAt: 1 },
      }
    );
  }

  countActiveDocuments(owner) {
    return AiTutorDocument.countDocuments({ owner, status: { $in: ['processing', 'ready'] } });
  }

  findReadyDuplicate(owner, contentHash, embeddingVersion) {
    return AiTutorDocument.findOne({
      owner,
      contentHash,
      embeddingVersion,
      status: 'ready',
    }).lean();
  }

  createProcessingDocument(data) {
    return AiTutorDocument.create(data);
  }

  listDocuments(owner) {
    return AiTutorDocument.find({ owner, status: { $ne: 'deleted' } })
      .sort({ createdAt: -1 })
      .lean();
  }

  findDocument(owner, documentId) {
    return AiTutorDocument.findOne({ _id: documentId, owner }).lean();
  }

  async insertChunks(owner, documentId, processingToken, chunks) {
    const active = await AiTutorDocument.exists({
      _id: documentId,
      owner,
      status: 'processing',
      processingToken,
    });
    if (!active) return false;
    await AiTutorDocumentChunk.insertMany(
      chunks.map((chunk) => ({ ...chunk, owner, document: documentId })),
      { ordered: true }
    );
    return true;
  }

  async finalizeDocument(owner, documentId, processingToken, update) {
    return AiTutorDocument.findOneAndUpdate(
      { _id: documentId, owner, status: 'processing', processingToken },
      {
        $set: { ...update, status: 'ready', indexedAt: new Date(), failureCategory: null },
        $unset: { processingToken: 1, processingExpiresAt: 1 },
      },
      { new: true }
    ).lean();
  }

  async failDocument(owner, documentId, processingToken, failureCategory) {
    await AiTutorDocumentChunk.deleteMany({ owner, document: documentId });
    return AiTutorDocument.findOneAndUpdate(
      { _id: documentId, owner, status: 'processing', processingToken },
      {
        $set: { status: 'failed', failureCategory },
        $unset: { processingToken: 1, processingExpiresAt: 1 },
      },
      { new: true }
    ).lean();
  }

  async loadCompatibleChunks(owner, documentId, embeddingVersion, limit) {
    return AiTutorDocumentChunk.find({ owner, document: documentId, embeddingVersion })
      .sort({ ordinal: 1 })
      .limit(limit)
      .select('+embedding')
      .lean();
  }

  async markDeleting(owner, documentId) {
    return AiTutorDocument.findOneAndUpdate(
      { _id: documentId, owner, status: { $in: ['processing', 'ready', 'failed'] } },
      { $set: { status: 'deleting', deletedAt: new Date() }, $unset: { processingToken: 1 } },
      { new: true }
    ).lean();
  }

  async deleteDocumentContent(owner, documentId) {
    const conversations = await AiTutorConversation.find({ owner, document: documentId }).select('_id');
    const conversationIds = conversations.map((conversation) => conversation._id);
    // Study artifacts contain private derived document content. Remove them
    // before the source chunks so an interrupted cleanup cannot orphan them.
    await AiTutorQuizAttempt.deleteMany({ owner, document: documentId });
    await AiTutorQuiz.deleteMany({ owner, document: documentId });
    await AiTutorSummary.deleteMany({ owner, document: documentId });
    await AiTutorStudyRequest.deleteMany({ owner, document: documentId });
    await AiTutorDocumentChunk.deleteMany({ owner, document: documentId });
    if (conversationIds.length) {
      await AiTutorMessage.deleteMany({ owner, conversation: { $in: conversationIds } });
      await AiTutorRequest.deleteMany({ owner, conversation: { $in: conversationIds } });
      await AiTutorConversation.deleteMany({ owner, _id: { $in: conversationIds } });
    }
    await AiTutorDocument.updateOne(
      { _id: documentId, owner, status: 'deleting' },
      {
        $set: {
          status: 'deleted',
          displayName: 'Deleted document',
          contentHash: 'deleted',
          pageCount: 0,
          extractedCharacterCount: 0,
          chunkCount: 0,
          embeddingModel: null,
          embeddingDimensions: null,
          embeddingVersion: null,
        },
        $unset: { processingExpiresAt: 1 },
      }
    );
    return { deletedConversationIds: conversationIds.map(String) };
  }

  async getMessageSource(owner, conversationId, messageId, chunkId) {
    const conversation = await AiTutorConversation.findOne({
      _id: conversationId,
      owner,
      mode: 'document',
    }).lean();
    if (!conversation) return null;
    const document = await AiTutorDocument.findOne({
      _id: conversation.document,
      owner,
      status: 'ready',
    }).lean();
    if (!document) return null;
    const message = await AiTutorMessage.findOne({
      _id: messageId,
      owner,
      conversation: conversationId,
      role: 'assistant',
      'sources.chunk': chunkId,
    }).lean();
    if (!message) return null;
    const source = message.sources.find((entry) => String(entry.chunk) === String(chunkId));
    const chunk = await AiTutorDocumentChunk.findOne({
      _id: chunkId,
      owner,
      document: document._id,
    }).lean();
    if (!chunk) return null;
    return { document, chunk, sourceId: source.sourceId, label: source.label };
  }
}
