import express from 'express';
import multer from 'multer';
import { getAiTutorConfig } from '../config/aiTutor.js';
import { authenticateToken } from '../middleware/auth.js';
import { aiTutorSendLimiter } from '../middleware/rateLimit.js';
import { createGeminiProvider } from '../services/aiTutorProvider.js';
import { createGeminiEmbeddingProvider } from '../services/aiTutorEmbeddingProvider.js';
import { MongoAiTutorDocumentRepository } from '../services/aiTutorDocumentRepository.js';
import {
  AiTutorDocumentError,
  AiTutorDocumentService,
  BoundedProcessingQueue,
} from '../services/aiTutorDocumentService.js';
import { MongoAiTutorRepository } from '../services/aiTutorRepository.js';
import { MongoAiTutorStudyRepository } from '../services/aiTutorStudyRepository.js';
import { AiTutorStudyError, AiTutorStudyService } from '../services/aiTutorStudyService.js';
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
  if (error instanceof AiTutorDocumentError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  if (error instanceof AiTutorError) {
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
      usage: error.usage || null,
      retryAllowed: Boolean(error.retryAllowed),
      userMessage: error.userMessage || null,
    });
  }
  if (error instanceof AiTutorStudyError) {
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
      usage: error.usage || null,
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
  const documentRepository = options.documentRepository || new MongoAiTutorDocumentRepository();
  const studyRepository = options.studyRepository || new MongoAiTutorStudyRepository();
  // Do not even initialise the SDK with a missing key. The status/send service
  // returns the clear unavailable response before this placeholder is called.
  const provider =
    options.provider ||
    (config.apiKey
      ? createGeminiProvider(config)
      : {
          generate: async () => { throw new Error('AI Tutor provider is not configured.'); },
          generateStudySummary: async () => { throw new Error('AI Tutor provider is not configured.'); },
          generateStudyQuiz: async () => { throw new Error('AI Tutor provider is not configured.'); },
          generateStudyFlashcards: async () => { throw new Error('AI Tutor provider is not configured.'); },
        });
  const embeddingProvider =
    options.embeddingProvider ||
    (config.apiKey
      ? createGeminiEmbeddingProvider(config)
      : {
          embedDocuments: async () => { throw new Error('Embedding provider is not configured.'); },
          embedQuery: async () => { throw new Error('Embedding provider is not configured.'); },
        });
  const processingQueue =
    options.processingQueue || new BoundedProcessingQueue(config.documentGlobalProcessingConcurrency);
  const documentService =
    options.documentService ||
    new AiTutorDocumentService({
      config,
      repository: documentRepository,
      embeddingProvider,
      queue: processingQueue,
    });
  const service =
    options.service || new AiTutorService({ config, repository, provider, documentService });
  const studyService =
    options.studyService ||
    new AiTutorStudyService({
      config,
      repository: studyRepository,
      baseRepository: repository,
      documentService,
      provider,
    });
  const auth = options.authenticate || authenticateToken;
  const sendLimiter = options.sendLimiter === undefined ? aiTutorSendLimiter : options.sendLimiter;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: config.documentMaxFileBytes },
  });

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

  router.get('/documents', async (req, res) => {
    try {
      res.json(await documentService.list(req.user.userId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/documents', async (req, res) => {
    let hasConsent;
    try {
      hasConsent = await repository.hasConsent(req.user.userId, config.consentVersion);
      if (!hasConsent) throw new AiTutorDocumentError('DOCUMENT_CONSENT_REQUIRED');
    } catch (error) {
      sendError(res, error);
      return;
    }
    upload.single('file')(req, res, async (uploadError) => {
      try {
        if (uploadError) {
          if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
            throw new AiTutorDocumentError('DOCUMENT_FILE_TOO_LARGE');
          }
          throw new AiTutorDocumentError('DOCUMENT_FILE_REQUIRED');
        }
        if (Object.keys(req.body || {}).length > 0) {
          return res.status(400).json({ code: 'INVALID_INPUT', message: 'Unexpected upload fields.' });
        }
        const result = await documentService.upload(req.user.userId, req.file, hasConsent);
        res.status(result.duplicate ? 200 : 201).json(result);
      } catch (error) {
        sendError(res, error);
      }
    });
  });

  router.delete('/documents/:documentId', async (req, res) => {
    try {
      if (!validateConversationId(req.params.documentId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid document ID.' });
      }
      res.json(await documentService.delete(req.user.userId, req.params.documentId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/documents/:documentId/study', async (req, res) => {
    try {
      if (!validateConversationId(req.params.documentId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid document ID.' });
      }
      res.json(await studyService.workspace(req.user.userId, req.params.documentId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    '/documents/:documentId/summaries',
    ...(sendLimiter ? [sendLimiter] : []),
    async (req, res) => {
      try {
        if (!validateConversationId(req.params.documentId)) {
          return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid document ID.' });
        }
        const fields = Object.keys(req.body || {});
        if (fields.some((field) => !['clientRequestId', 'language', 'length', 'regenerate'].includes(field))) {
          return res.status(400).json({ code: 'INVALID_INPUT', message: 'Unexpected summary fields.' });
        }
        const clientRequestId = String(req.body?.clientRequestId || '');
        if (!REQUEST_ID_PATTERN.test(clientRequestId)) {
          return res.status(400).json({ code: 'INVALID_REQUEST_ID', message: 'A valid client request ID is required.' });
        }
        res.json(await studyService.generateSummary({
          owner: req.user.userId,
          documentId: req.params.documentId,
          clientRequestId,
          input: req.body,
        }));
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    '/documents/:documentId/quizzes',
    ...(sendLimiter ? [sendLimiter] : []),
    async (req, res) => {
      try {
        if (!validateConversationId(req.params.documentId)) {
          return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid document ID.' });
        }
        const fields = Object.keys(req.body || {});
        if (fields.some((field) => !['clientRequestId', 'count', 'difficulty', 'language'].includes(field))) {
          return res.status(400).json({ code: 'INVALID_INPUT', message: 'Unexpected quiz fields.' });
        }
        const clientRequestId = String(req.body?.clientRequestId || '');
        if (!REQUEST_ID_PATTERN.test(clientRequestId)) {
          return res.status(400).json({ code: 'INVALID_REQUEST_ID', message: 'A valid client request ID is required.' });
        }
        res.json(await studyService.generateQuiz({
          owner: req.user.userId,
          documentId: req.params.documentId,
          clientRequestId,
          input: req.body,
        }));
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    '/documents/:documentId/flashcard-decks',
    ...(sendLimiter ? [sendLimiter] : []),
    async (req, res) => {
      try {
        if (!validateConversationId(req.params.documentId)) {
          return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid document ID.' });
        }
        if (Object.keys(req.body || {}).some((field) => !['clientRequestId', 'count', 'language'].includes(field))) {
          return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid flashcard options.' });
        }
        const clientRequestId = String(req.body?.clientRequestId || '');
        if (!REQUEST_ID_PATTERN.test(clientRequestId)) {
          return res.status(400).json({ code: 'INVALID_REQUEST_ID', message: 'A valid client request ID is required.' });
        }
        res.json(await studyService.generateFlashcards({
          owner: req.user.userId,
          documentId: req.params.documentId,
          clientRequestId,
          input: req.body,
        }));
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.delete('/flashcard-decks/:deckId', async (req, res) => {
    try {
      if (!validateConversationId(req.params.deckId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid deck ID.' });
      }
      res.json(await studyService.deleteDeck(req.user.userId, req.params.deckId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/flashcard-decks/:deckId/review-sessions', async (req, res) => {
    try {
      if (
        !validateConversationId(req.params.deckId) ||
        Object.keys(req.body || {}).some((field) => field !== 'mode')
      ) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid review request.' });
      }
      res.status(201).json(await studyService.startReviewSession(
        req.user.userId,
        req.params.deckId,
        req.body?.mode
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/flashcard-review-sessions/:sessionId', async (req, res) => {
    try {
      if (!validateConversationId(req.params.sessionId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid review session ID.' });
      }
      res.json(await studyService.getReviewSession(req.user.userId, req.params.sessionId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/flashcard-review-sessions/:sessionId/reveal', async (req, res) => {
    try {
      if (!validateConversationId(req.params.sessionId) || Object.keys(req.body || {}).length) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid reveal request.' });
      }
      res.json(await studyService.getReviewSession(req.user.userId, req.params.sessionId, true));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/flashcard-review-sessions/:sessionId/rate', async (req, res) => {
    try {
      if (
        !validateConversationId(req.params.sessionId) ||
        Object.keys(req.body || {}).some((field) => ![
          'eventId', 'rating', 'expectedStateVersion', 'expectedSessionVersion',
        ].includes(field))
      ) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid review rating.' });
      }
      res.json(await studyService.rateFlashcard(req.user.userId, req.params.sessionId, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/flashcard-decks/:deckId/cards/:cardId/sources/:chunkId', async (req, res) => {
    try {
      if (![req.params.deckId, req.params.cardId, req.params.chunkId].every(validateConversationId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid source reference.' });
      }
      res.json(await studyService.flashcardSource(
        req.user.userId,
        req.params.deckId,
        req.params.cardId,
        req.params.chunkId
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/study-progress', async (req, res) => {
    try {
      if (Object.keys(req.query || {}).some((field) => field !== 'timezone')) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid progress query.' });
      }
      res.json(await studyService.progress(req.user.userId, String(req.query.timezone || 'UTC')));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/quizzes/:quizId/attempts', async (req, res) => {
    try {
      if (!validateConversationId(req.params.quizId) || Object.keys(req.body || {}).length) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid quiz attempt request.' });
      }
      res.status(201).json(await studyService.startAttempt(req.user.userId, req.params.quizId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/quiz-attempts/:attemptId', async (req, res) => {
    try {
      if (!validateConversationId(req.params.attemptId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid attempt ID.' });
      }
      res.json(await studyService.getAttempt(req.user.userId, req.params.attemptId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/quiz-attempts/:attemptId/answers', async (req, res) => {
    try {
      if (!validateConversationId(req.params.attemptId) || Object.keys(req.body || {}).some((field) => !['questionIndex', 'selectedOptionIndex'].includes(field))) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid answer request.' });
      }
      res.json(await studyService.saveAnswer(
        req.user.userId,
        req.params.attemptId,
        req.body?.questionIndex,
        req.body?.selectedOptionIndex
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/quiz-attempts/:attemptId/submit', async (req, res) => {
    try {
      if (!validateConversationId(req.params.attemptId) || Object.keys(req.body || {}).length) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid submit request.' });
      }
      res.json(await studyService.submitAttempt(req.user.userId, req.params.attemptId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/summaries/:summaryId/sources/:chunkId', async (req, res) => {
    try {
      if (![req.params.summaryId, req.params.chunkId].every(validateConversationId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid source reference.' });
      }
      res.json(await studyService.summarySource(req.user.userId, req.params.summaryId, req.params.chunkId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/quiz-attempts/:attemptId/sources/:questionIndex/:chunkId', async (req, res) => {
    try {
      const questionIndex = Number(req.params.questionIndex);
      if (!validateConversationId(req.params.attemptId) || !validateConversationId(req.params.chunkId) || !Number.isInteger(questionIndex) || questionIndex < 0) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid source reference.' });
      }
      res.json(await studyService.attemptSource(req.user.userId, req.params.attemptId, questionIndex, req.params.chunkId));
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
      const fields = Object.keys(req.body || {});
      if (fields.some((field) => !['mode', 'documentId'].includes(field))) {
        return res.status(400).json({
          code: 'INVALID_INPUT',
          message: 'Conversation ownership and title are managed by the server.',
        });
      }
      const mode = req.body?.mode || 'general';
      if (!['general', 'document'].includes(mode)) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid conversation mode.' });
      }
      const documentId = req.body?.documentId;
      if (mode === 'document' && !validateConversationId(documentId)) {
        return res.status(400).json({ code: 'INVALID_ID', message: 'A valid document ID is required.' });
      }
      if (mode === 'general' && documentId) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: 'General chats cannot select a document.' });
      }
      const conversation = await service.createConversation(req.user.userId, { mode, documentId });
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

  router.get(
    '/conversations/:conversationId/messages/:messageId/sources/:chunkId',
    async (req, res) => {
      try {
        const { conversationId, messageId, chunkId } = req.params;
        if (![conversationId, messageId, chunkId].every(validateConversationId)) {
          return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid source reference.' });
        }
        res.json(await documentService.source(req.user.userId, conversationId, messageId, chunkId));
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  return router;
}

export { REQUEST_ID_PATTERN, SEND_FIELDS };
