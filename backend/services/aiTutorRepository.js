import AiTutorConsent from '../models/AiTutorConsent.js';
import AiTutorConversation from '../models/AiTutorConversation.js';
import AiTutorGenerationLock from '../models/AiTutorGenerationLock.js';
import AiTutorMessage from '../models/AiTutorMessage.js';
import AiTutorRequest from '../models/AiTutorRequest.js';
import AiTutorUsage from '../models/AiTutorUsage.js';

const isDuplicateKey = (error) => error?.code === 11000;

function utcBucket(now = new Date()) {
  const bucket = now.toISOString().slice(0, 10);
  const resetAt = new Date(`${bucket}T00:00:00.000Z`);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  return { bucket, resetAt };
}

function usageFromDocument(document, userId, config, resetAt) {
  const rawUsers = document?.users;
  const userCount = rawUsers?.get
    ? Number(rawUsers.get(String(userId)) || 0)
    : Number(rawUsers?.[String(userId)] || 0);
  const globalCount = Number(document?.globalCount || 0);

  return {
    userRemaining: Math.max(0, config.dailyUserLimit - userCount),
    globalRemaining: Math.max(0, config.dailyGlobalLimit - globalCount),
    resetAt,
  };
}

export class MongoAiTutorRepository {
  async hasConsent(owner, version) {
    return Boolean(await AiTutorConsent.exists({ owner, version }));
  }

  async recordConsent(owner, version) {
    return AiTutorConsent.findOneAndUpdate(
      { owner },
      { $set: { version, acceptedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }

  async getUsage(owner, config, now = new Date()) {
    const { bucket, resetAt } = utcBucket(now);
    const document = await AiTutorUsage.findOne({ bucket }).lean();
    return usageFromDocument(document, owner, config, resetAt);
  }

  async reserveUsage(owner, config, now = new Date()) {
    const { bucket, resetAt } = utcBucket(now);
    const expiresAt = new Date(resetAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 35);

    try {
      await AiTutorUsage.updateOne(
        { bucket },
        { $setOnInsert: { bucket, globalCount: 0, users: {}, expiresAt } },
        { upsert: true }
      );
    } catch (error) {
      // Two app instances may race to create the day's document. The unique
      // bucket index decides the winner; both can continue to the atomic claim.
      if (!isDuplicateKey(error)) throw error;
    }

    const userPath = `users.${String(owner)}`;
    const document = await AiTutorUsage.findOneAndUpdate(
      {
        bucket,
        globalCount: { $lt: config.dailyGlobalLimit },
        $expr: {
          $lt: [{ $ifNull: [`$${userPath}`, 0] }, config.dailyUserLimit],
        },
      },
      { $inc: { globalCount: 1, [userPath]: 1 } },
      { new: true }
    ).lean();

    if (document) {
      return { admitted: true, usage: usageFromDocument(document, owner, config, resetAt) };
    }

    const current = await AiTutorUsage.findOne({ bucket }).lean();
    const usage = usageFromDocument(current, owner, config, resetAt);
    return {
      admitted: false,
      reason: usage.userRemaining === 0 ? 'USER_DAILY_LIMIT' : 'GLOBAL_DAILY_LIMIT',
      usage,
    };
  }

  async createConversation(owner, options = {}) {
    return AiTutorConversation.create({
      owner,
      title: options.mode === 'document' ? options.documentName || 'Document chat' : 'New learning chat',
      mode: options.mode || 'general',
      document: options.documentId || null,
    });
  }

  async listConversations(owner, { page, limit }) {
    const filter = { owner };
    const [items, total] = await Promise.all([
      AiTutorConversation.find(filter)
        .populate('document', 'displayName fileType status')
        .sort({ lastMessageAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AiTutorConversation.countDocuments(filter),
    ]);
    return { items, total };
  }

  async findConversation(owner, conversationId) {
    return AiTutorConversation.findOne({ _id: conversationId, owner })
      .populate('document', 'displayName fileType status embeddingVersion embeddingModel embeddingDimensions')
      .lean();
  }

  async admitTurn(owner, conversationId, { title, preview, maxTurns }) {
    const existing = await AiTutorConversation.findOne({
      _id: conversationId,
      owner,
      turnCount: { $lt: maxTurns },
    }).select('turnCount');
    if (!existing) return null;

    const update = {
      $inc: { turnCount: 1 },
      $set: { lastMessagePreview: preview, lastMessageAt: new Date() },
    };
    if (existing.turnCount === 0) update.$set.title = title;

    return AiTutorConversation.findOneAndUpdate(
      { _id: conversationId, owner, turnCount: existing.turnCount },
      update,
      { new: true }
    ).lean();
  }

  async touchConversation(owner, conversationId, preview) {
    return AiTutorConversation.findOneAndUpdate(
      { _id: conversationId, owner },
      { $set: { lastMessagePreview: preview, lastMessageAt: new Date() } },
      { new: true }
    ).lean();
  }

  async listMessages(owner, conversationId, { before, limit }) {
    const filter = { owner, conversation: conversationId };
    if (before) filter._id = { $lt: before };

    const rows = await AiTutorMessage.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).reverse();
    return {
      items,
      hasMore,
      nextCursor: hasMore ? String(rows[limit - 1]._id) : null,
    };
  }

  async recentCompletedMessages(owner, conversationId, limit) {
    const rows = await AiTutorMessage.find({
      owner,
      conversation: conversationId,
      status: 'completed',
    })
      .sort({ _id: -1 })
      .limit(limit)
      .select('role text')
      .lean();
    return rows.reverse();
  }

  async createUserMessage({ owner, conversationId, text, clientRequestId }) {
    return AiTutorMessage.create({
      owner,
      conversation: conversationId,
      role: 'user',
      text,
      status: 'pending',
      clientRequestId,
    });
  }

  async completeUserMessage(messageId) {
    return AiTutorMessage.findByIdAndUpdate(
      messageId,
      { $set: { status: 'completed', safeErrorCode: null } },
      { new: true }
    ).lean();
  }

  async failUserMessage(messageId, safeErrorCode) {
    if (!messageId) return null;
    return AiTutorMessage.findByIdAndUpdate(
      messageId,
      { $set: { status: 'failed', safeErrorCode } },
      { new: true }
    ).lean();
  }

  async createAssistantMessage({ owner, conversationId, text, clientRequestId, sources = [] }) {
    return AiTutorMessage.create({
      owner,
      conversation: conversationId,
      role: 'assistant',
      text,
      status: 'completed',
      clientRequestId,
      sources: sources.map((source) => ({
        sourceId: source.sourceId,
        chunk: source.chunkId,
        label: source.label,
      })),
    });
  }

  async claimRequest({ owner, conversationId, clientRequestId }) {
    try {
      const request = await AiTutorRequest.create({ owner, conversation: conversationId, clientRequestId });
      return { created: true, request };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const request = await AiTutorRequest.findOne({ owner, clientRequestId }).lean();
      return { created: false, request };
    }
  }

  async updateRequest(requestId, update) {
    return AiTutorRequest.findByIdAndUpdate(requestId, { $set: update }, { new: true }).lean();
  }

  async hydrateRequest(request) {
    if (!request) return null;
    const [userMessage, assistantMessage] = await Promise.all([
      request.userMessage ? AiTutorMessage.findById(request.userMessage).lean() : null,
      request.assistantMessage ? AiTutorMessage.findById(request.assistantMessage).lean() : null,
    ]);
    return { ...request, userMessage, assistantMessage };
  }

  async acquireLock(owner, token, ttlMs) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    try {
      const lock = await AiTutorGenerationLock.findOneAndUpdate(
        { owner, $or: [{ expiresAt: { $lte: now } }, { token }] },
        { $set: { token, expiresAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return Boolean(lock);
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async releaseLock(owner, token) {
    await AiTutorGenerationLock.deleteOne({ owner, token });
  }

  async isLocked(owner) {
    return Boolean(await AiTutorGenerationLock.exists({ owner, expiresAt: { $gt: new Date() } }));
  }

  async deleteConversation(owner, conversationId) {
    const conversation = await AiTutorConversation.findOne({ _id: conversationId, owner }).lean();
    if (!conversation) return false;

    // Children first: if the process stops halfway, private message data is
    // already gone and the remaining empty conversation is still owner-only.
    await AiTutorMessage.deleteMany({ owner, conversation: conversationId });
    await AiTutorRequest.deleteMany({ owner, conversation: conversationId });
    await AiTutorConversation.deleteOne({ _id: conversationId, owner });
    return true;
  }
}

export { utcBucket, usageFromDocument };
