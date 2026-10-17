import mongoose from 'mongoose';
import { getAiTutorAvailability } from '../config/aiTutor.js';
import { AiTutorProviderError, providerAttemptCount } from './aiTutorProvider.js';

const ERROR_DEFINITIONS = {
  AI_TUTOR_DISABLED: [503, 'AI Tutor is currently unavailable.'],
  AI_TUTOR_NOT_CONFIGURED: [503, 'AI Tutor is not configured yet. Please try again later.'],
  CONSENT_REQUIRED: [428, 'Please review and accept the AI processing notice before sending a message.'],
  CONVERSATION_NOT_FOUND: [404, 'Conversation not found.'],
  CONVERSATION_LIMIT: [409, 'This chat has reached its limit. Start a new chat to continue learning.'],
  GENERATION_IN_PROGRESS: [409, 'Your previous AI Tutor response is still being generated.'],
  REQUEST_IN_PROGRESS: [409, 'This message is already being processed.'],
  REQUEST_ID_REUSED: [409, 'That request ID has already been used for another chat.'],
  USER_DAILY_LIMIT: [429, "You've used today's AI Tutor messages. Your allowance resets at midnight UTC."],
  GLOBAL_DAILY_LIMIT: [429, "AI Tutor has reached today's shared limit. Please try again after midnight UTC."],
  PROVIDER_QUOTA: [503, 'AI Tutor is busy because its provider limit was reached. Please try again later.'],
  PROVIDER_TIMEOUT: [504, 'AI Tutor took too long to respond. Your message was kept so you can retry explicitly.'],
  PROVIDER_CONFIG: [503, 'AI Tutor is temporarily unavailable because of a configuration problem.'],
  PROVIDER_UNAVAILABLE: [503, 'AI Tutor is temporarily unavailable. Please try again later.'],
  PROVIDER_NETWORK: [503, 'AI Tutor could not reach its provider. Please try again later.'],
  PROVIDER_ERROR: [502, 'AI Tutor could not complete that response. Please try again later.'],
  EMPTY_RESPONSE: [502, 'AI Tutor returned an empty response. Please try again with a new request.'],
  SAFETY_BLOCKED: [422, 'AI Tutor could not answer that request. Try rephrasing it without sensitive or unsafe content.'],
};

export class AiTutorError extends Error {
  constructor(code, extras = {}) {
    const [status, message] = ERROR_DEFINITIONS[code] || [500, 'AI Tutor could not complete the request.'];
    super(message);
    this.name = 'AiTutorError';
    this.code = code;
    this.status = status;
    Object.assign(this, extras);
  }
}

function publicMessage(message) {
  if (!message) return null;
  return {
    id: String(message._id || message.id),
    role: message.role,
    text: message.text,
    status: message.status,
    clientRequestId: message.clientRequestId,
    errorCode: message.safeErrorCode || null,
    createdAt: message.createdAt,
  };
}

function publicConversation(conversation) {
  return {
    id: String(conversation._id || conversation.id),
    title: conversation.title,
    turnCount: conversation.turnCount || 0,
    lastMessagePreview: conversation.lastMessagePreview || '',
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function titleFromMessage(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 64 ? `${clean.slice(0, 61).trimEnd()}...` : clean;
}

function previewFromMessage(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 160 ? `${clean.slice(0, 157).trimEnd()}...` : clean;
}

function boundedHistory(messages, maxChars) {
  const selected = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const size = message.text.length;
    if (selected.length > 0 && used + size > maxChars) break;
    if (size > maxChars) continue;
    selected.unshift({ role: message.role, text: message.text });
    used += size;
  }
  return selected;
}

function logEvent(logger, name, fields) {
  logger.info?.(`[ai-tutor] ${name} ${JSON.stringify(fields)}`);
}

export class AiTutorService {
  constructor({ config, repository, provider, logger = console, now = () => new Date() }) {
    this.config = config;
    this.repository = repository;
    this.provider = provider;
    this.logger = logger;
    this.now = now;
  }

  assertAvailable() {
    const availability = getAiTutorAvailability(this.config);
    if (!availability.available) throw new AiTutorError(availability.code);
  }

  async getStatus(owner) {
    const availability = getAiTutorAvailability(this.config);
    const [consented, usage] = await Promise.all([
      this.repository.hasConsent(owner, this.config.consentVersion),
      this.repository.getUsage(owner, this.config, this.now()),
    ]);

    return {
      ...availability,
      consentRequired: !consented,
      consentVersion: this.config.consentVersion,
      termsUrl: this.config.termsUrl,
      usage,
      limits: {
        dailyUser: this.config.dailyUserLimit,
        maxInputChars: this.config.maxInputChars,
        maxConversationTurns: this.config.maxConversationTurns,
      },
    };
  }

  async acceptConsent(owner, accepted) {
    if (accepted !== true) throw new AiTutorError('CONSENT_REQUIRED');
    await this.repository.recordConsent(owner, this.config.consentVersion);
    return { accepted: true, version: this.config.consentVersion };
  }

  async createConversation(owner) {
    this.assertAvailable();
    const conversation = await this.repository.createConversation(owner);
    return publicConversation(conversation);
  }

  async listConversations(owner, pagination) {
    const result = await this.repository.listConversations(owner, pagination);
    return {
      conversations: result.items.map(publicConversation),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: result.total,
        pages: Math.ceil(result.total / pagination.limit),
      },
    };
  }

  async listMessages(owner, conversationId, pagination) {
    const conversation = await this.repository.findConversation(owner, conversationId);
    if (!conversation) throw new AiTutorError('CONVERSATION_NOT_FOUND');
    const result = await this.repository.listMessages(owner, conversationId, pagination);
    return {
      conversation: publicConversation(conversation),
      messages: result.items.map(publicMessage),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  async deleteConversation(owner, conversationId) {
    if (await this.repository.isLocked(owner)) {
      throw new AiTutorError('GENERATION_IN_PROGRESS');
    }
    const deleted = await this.repository.deleteConversation(owner, conversationId);
    if (!deleted) throw new AiTutorError('CONVERSATION_NOT_FOUND');
    return { deleted: true };
  }

  async duplicateResult(request, conversationId) {
    if (String(request.conversation) !== String(conversationId)) {
      throw new AiTutorError('REQUEST_ID_REUSED');
    }
    if (request.status === 'completed') {
      const hydrated = await this.repository.hydrateRequest(request);
      const conversation = await this.repository.findConversation(request.owner, conversationId);
      return {
        duplicate: true,
        conversation: publicConversation(conversation),
        userMessage: publicMessage(hydrated.userMessage),
        assistantMessage: publicMessage(hydrated.assistantMessage),
        usage: request.usage,
      };
    }
    if (request.status === 'failed' || request.status === 'rejected') {
      throw new AiTutorError(request.safeErrorCode || 'PROVIDER_ERROR', {
        usage: request.usage,
        retryAllowed: request.status === 'failed',
      });
    }
    throw new AiTutorError('REQUEST_IN_PROGRESS');
  }

  async sendMessage({ owner, conversationId, text, clientRequestId }) {
    this.assertAvailable();

    const conversation = await this.repository.findConversation(owner, conversationId);
    if (!conversation) throw new AiTutorError('CONVERSATION_NOT_FOUND');
    if (!(await this.repository.hasConsent(owner, this.config.consentVersion))) {
      throw new AiTutorError('CONSENT_REQUIRED');
    }

    const claim = await this.repository.claimRequest({ owner, conversationId, clientRequestId });
    if (!claim.created) return this.duplicateResult(claim.request, conversationId);

    const requestId = String(claim.request._id || claim.request.id);
    const providerAttempts = providerAttemptCount(this.config);
    const retryDelayTotalMs =
      Math.max(0, Number(this.config.retryDelayMs || 0)) *
      ((providerAttempts - 1) * providerAttempts) / 2;
    // Cover every possible provider attempt, every backoff, and a DB/storage
    // buffer. The lock therefore cannot expire while an admitted retry is
    // still capable of producing an assistant response.
    const lockTtlMs =
      this.config.requestTimeoutMs * providerAttempts + retryDelayTotalMs + 15000;
    const locked = await this.repository.acquireLock(owner, clientRequestId, lockTtlMs);
    if (!locked) {
      await this.repository.updateRequest(requestId, {
        status: 'rejected',
        safeErrorCode: 'GENERATION_IN_PROGRESS',
      });
      throw new AiTutorError('GENERATION_IN_PROGRESS');
    }

    const startedAt = Date.now();
    let admitted = false;
    let usage = null;
    let userMessage = null;

    try {
      if (conversation.turnCount >= this.config.maxConversationTurns) {
        await this.repository.updateRequest(requestId, {
          status: 'rejected',
          safeErrorCode: 'CONVERSATION_LIMIT',
        });
        throw new AiTutorError('CONVERSATION_LIMIT');
      }

      const reservation = await this.repository.reserveUsage(owner, this.config, this.now());
      usage = reservation.usage;
      if (!reservation.admitted) {
        await this.repository.updateRequest(requestId, {
          status: 'rejected',
          safeErrorCode: reservation.reason,
          usage,
        });
        throw new AiTutorError(reservation.reason, { usage });
      }
      admitted = true;

      const updatedConversation = await this.repository.admitTurn(owner, conversationId, {
        title: titleFromMessage(text),
        preview: previewFromMessage(text),
        maxTurns: this.config.maxConversationTurns,
      });
      if (!updatedConversation) {
        await this.repository.updateRequest(requestId, {
          status: 'failed',
          safeErrorCode: 'CONVERSATION_LIMIT',
          usage,
        });
        throw new AiTutorError('CONVERSATION_LIMIT', { usage });
      }

      const historyRows = await this.repository.recentCompletedMessages(
        owner,
        conversationId,
        this.config.maxContextMessages
      );
      const history = boundedHistory(historyRows, this.config.maxContextChars);

      userMessage = await this.repository.createUserMessage({
        owner,
        conversationId,
        text,
        clientRequestId,
      });
      await this.repository.updateRequest(requestId, {
        status: 'admitted',
        userMessage: userMessage._id || userMessage.id,
        usage,
      });

      const answer = await this.provider.generate({
        history,
        prompt: text,
        requestId: clientRequestId,
        // A final admitted request must still produce a useful answer. Without
        // this signal the model can spend the user's last turn asking a
        // clarifying question that they cannot answer until the next reset.
        isLastAllowedTurn:
          usage?.userRemaining === 0 || usage?.globalRemaining === 0,
      });
      const completedUserMessage = await this.repository.completeUserMessage(
        userMessage._id || userMessage.id
      );
      const assistantMessage = await this.repository.createAssistantMessage({
        owner,
        conversationId,
        text: answer,
        clientRequestId,
      });
      const finalConversation = await this.repository.touchConversation(
        owner,
        conversationId,
        previewFromMessage(answer)
      );

      await this.repository.updateRequest(requestId, {
        status: 'completed',
        assistantMessage: assistantMessage._id || assistantMessage.id,
        safeErrorCode: null,
        usage,
      });

      logEvent(this.logger, 'completed', {
        requestId: clientRequestId,
        durationMs: Date.now() - startedAt,
        status: 'completed',
      });

      return {
        duplicate: false,
        conversation: publicConversation(finalConversation),
        userMessage: publicMessage(completedUserMessage),
        assistantMessage: publicMessage(assistantMessage),
        usage,
      };
    } catch (error) {
      if (error instanceof AiTutorError && !admitted) throw error;

      const code =
        error instanceof AiTutorProviderError
          ? error.code
          : error instanceof AiTutorError
            ? error.code
            : 'PROVIDER_ERROR';

      const failedMessage = await this.repository.failUserMessage(
        userMessage?._id || userMessage?.id,
        code
      );
      await this.repository.updateRequest(requestId, {
        status: 'failed',
        safeErrorCode: code,
        userMessage: failedMessage?._id || failedMessage?.id || userMessage?._id || userMessage?.id,
        usage,
      });

      logEvent(this.logger, 'failed', {
        requestId: clientRequestId,
        durationMs: Date.now() - startedAt,
        status: code,
      });
      throw new AiTutorError(code, { usage, retryAllowed: true, userMessage: publicMessage(failedMessage) });
    } finally {
      await this.repository.releaseLock(owner, clientRequestId);
    }
  }
}

export function validateConversationId(value) {
  return mongoose.isValidObjectId(value);
}

export { boundedHistory, publicConversation, publicMessage, titleFromMessage };
