import express from 'express';
import { getAiTutorConfig } from '../config/aiTutor.js';
import { authenticateToken } from '../middleware/auth.js';
import { aiTutorSendLimiter } from '../middleware/rateLimit.js';
import { createGeminiProvider } from '../services/aiTutorProvider.js';
import { MongoAiTutorRepository } from '../services/aiTutorRepository.js';
import {
  AiTutorError,
  AiTutorService,
  validateConversationId,
} from '../services/aiTutorService.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const SEND_FIELDS = new Set(['text', 'clientRequestId']);

function integerQuery(value, fallback, min, max) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function sendError(res, error) {
  if (error instanceof AiTutorError) {
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
      usage: error.usage || null,
      retryAllowed: Boolean(error.retryAllowed),
      userMessage: error.userMessage || null,
    });
  }

  console.error(
    `[ai-tutor] unexpected ${JSON.stringify({
      status: 'internal_error',
      category: error?.name || 'Error',
    })}`
  );
  return res.status(500).json({
    code: 'AI_TUTOR_INTERNAL_ERROR',
    message: 'AI Tutor could not complete the request.',
  });
}

export function createAiTutorRouter(options = {}) {
  const config = options.config || getAiTutorConfig();
  const repository = options.repository || new MongoAiTutorRepository();
  // Do not even initialise the SDK with a missing key. The status/send service
  // returns the clear unavailable response before this placeholder is called.
  const provider =
    options.provider ||
    (config.apiKey
      ? createGeminiProvider(config)
      : { generate: async () => { throw new Error('AI Tutor provider is not configured.'); } });
  const service = options.service || new AiTutorService({ config, repository, provider });
  const auth = options.authenticate || authenticateToken;
  const sendLimiter = options.sendLimiter === undefined ? aiTutorSendLimiter : options.sendLimiter;

  const router = express.Router();
  router.use(auth);

  router.get('/status', async (req, res) => {
    try {
      res.json(await service.getStatus(req.user.userId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/consent', async (req, res) => {
    try {
      if (Object.keys(req.body || {}).some((key) => key !== 'accepted')) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Unexpected consent fields.' });
      }
      res.json(await service.acceptConsent(req.user.userId, req.body?.accepted));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/conversations', async (req, res) => {
    try {
      const page = integerQuery(req.query.page, 1, 1, 100000);
      const limit = integerQuery(req.query.limit, 20, 1, 50);
      if (!page || !limit) {
        return res.status(400).json({ code: 'INVALID_PAGINATION', message: 'Invalid pagination.' });
      }
      res.json(await service.listConversations(req.user.userId, { page, limit }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/conversations', async (req, res) => {
    try {
      if (Object.keys(req.body || {}).length > 0) {
        return res.status(400).json({
          code: 'INVALID_INPUT',
          message: 'Conversation ownership and title are managed by the server.',
        });
      }
      const conversation = await service.createConversation(req.user.userId);
      res.status(201).json({ conversation });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/conversations/:conversationId/messages', async (req, res) => {
    try {
      const { conversationId } = req.params;
      if (!validateConversationId(conversationId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid conversation ID.' });
      }
      const limit = integerQuery(req.query.limit, 40, 1, 50);
      const before = req.query.before;
      if (!limit || (before && !validateConversationId(before))) {
        return res.status(400).json({ code: 'INVALID_PAGINATION', message: 'Invalid pagination.' });
      }
      res.json(
        await service.listMessages(req.user.userId, conversationId, { before, limit })
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    '/conversations/:conversationId/messages',
    ...(sendLimiter ? [sendLimiter] : []),
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        if (!validateConversationId(conversationId)) {
          return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid conversation ID.' });
        }

        const suppliedFields = Object.keys(req.body || {});
        if (suppliedFields.some((field) => !SEND_FIELDS.has(field))) {
          return res.status(400).json({
            code: 'CLIENT_HISTORY_REJECTED',
            message: 'Only message text and a request ID may be supplied.',
          });
        }

        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        const clientRequestId = String(req.body?.clientRequestId || '');
        if (!text) {
          return res.status(400).json({ code: 'INVALID_MESSAGE', message: 'Message text is required.' });
        }
        if (text.length > config.maxInputChars) {
          return res.status(400).json({
            code: 'MESSAGE_TOO_LONG',
            message: `Keep your message under ${config.maxInputChars} characters.`,
          });
        }
        if (!REQUEST_ID_PATTERN.test(clientRequestId)) {
          return res.status(400).json({
            code: 'INVALID_REQUEST_ID',
            message: 'A valid client request ID is required.',
          });
        }

        res.json(
          await service.sendMessage({
            owner: req.user.userId,
            conversationId,
            text,
            clientRequestId,
          })
        );
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.delete('/conversations/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params;
      if (!validateConversationId(conversationId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid conversation ID.' });
      }
      res.json(await service.deleteConversation(req.user.userId, conversationId));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export { REQUEST_ID_PATTERN, SEND_FIELDS };
