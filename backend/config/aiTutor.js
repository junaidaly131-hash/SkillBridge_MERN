const TERMS_URL = 'https://ai.google.dev/gemini-api/terms';
const CONSENT_VERSION = 'google-gemini-document-processing-2026-10-18';

function boundedInteger(name, fallback, min, max, invalidVariables) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    invalidVariables.push(name);
    return fallback;
  }
  return value;
}

/**
 * Read and validate AI Tutor configuration without ever logging secret values.
 * The feature defaults off so an incomplete deploy cannot break the rest of
 * SkillBridge or accidentally start provider traffic.
 */
export function getAiTutorConfig() {
  const enabled = String(process.env.AI_TUTOR_ENABLED || '').toLowerCase() === 'true';
  const invalidVariables = [];

  return Object.freeze({
    enabled,
    apiKey: process.env.GEMINI_API_KEY?.trim() || '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    dailyUserLimit: boundedInteger('AI_TUTOR_DAILY_USER_LIMIT', 10, 1, 100, invalidVariables),
    dailyGlobalLimit: boundedInteger('AI_TUTOR_DAILY_GLOBAL_LIMIT', 100, 1, 10000, invalidVariables),
    maxInputChars: boundedInteger('AI_TUTOR_MAX_INPUT_CHARS', 4000, 100, 10000, invalidVariables),
    maxOutputTokens: boundedInteger('AI_TUTOR_MAX_OUTPUT_TOKENS', 1024, 64, 4096, invalidVariables),
    // Gemini can take more than 30 seconds even for a small response. Keep the
    // provider timeout configurable, but use a production-safe default that
    // does not turn normal model latency into an application-level 504.
    requestTimeoutMs: boundedInteger('AI_TUTOR_REQUEST_TIMEOUT_MS', 60000, 5000, 120000, invalidVariables),
    providerAttempts: boundedInteger('AI_TUTOR_PROVIDER_ATTEMPTS', 2, 1, 2, invalidVariables),
    retryDelayMs: boundedInteger('AI_TUTOR_RETRY_DELAY_MS', 350, 0, 5000, invalidVariables),
    maxConversationTurns: boundedInteger('AI_TUTOR_MAX_CONVERSATION_TURNS', 50, 5, 200, invalidVariables),
    maxContextChars: boundedInteger('AI_TUTOR_MAX_CONTEXT_CHARS', 12000, 1000, 50000, invalidVariables),
    maxContextMessages: boundedInteger('AI_TUTOR_MAX_CONTEXT_MESSAGES', 24, 2, 60, invalidVariables),
    documentRagEnabled:
      String(process.env.AI_TUTOR_DOCUMENT_RAG_ENABLED || 'false').toLowerCase() === 'true',
    documentMaxFileBytes: boundedInteger(
      'AI_TUTOR_DOCUMENT_MAX_FILE_BYTES',
      5 * 1024 * 1024,
      1024,
      10 * 1024 * 1024,
      invalidVariables
    ),
    documentMaxPages: boundedInteger('AI_TUTOR_DOCUMENT_MAX_PAGES', 50, 1, 100, invalidVariables),
    documentMaxCharacters: boundedInteger(
      'AI_TUTOR_DOCUMENT_MAX_CHARACTERS',
      150000,
      1000,
      500000,
      invalidVariables
    ),
    documentMaxChunks: boundedInteger('AI_TUTOR_DOCUMENT_MAX_CHUNKS', 400, 1, 800, invalidVariables),
    documentMaxActivePerUser: boundedInteger(
      'AI_TUTOR_DOCUMENT_MAX_ACTIVE_PER_USER',
      5,
      1,
      20,
      invalidVariables
    ),
    documentDailyUploadAttempts: boundedInteger(
      'AI_TUTOR_DOCUMENT_DAILY_UPLOAD_ATTEMPTS',
      10,
      1,
      100,
      invalidVariables
    ),
    documentGlobalDailyEmbeddingCharacters: boundedInteger(
      'AI_TUTOR_DOCUMENT_GLOBAL_DAILY_EMBEDDING_CHARACTERS',
      1000000,
      10000,
      10000000,
      invalidVariables
    ),
    documentGlobalProcessingConcurrency: boundedInteger(
      'AI_TUTOR_DOCUMENT_GLOBAL_PROCESSING_CONCURRENCY',
      2,
      1,
      8,
      invalidVariables
    ),
    documentParseTimeoutMs: boundedInteger(
      'AI_TUTOR_DOCUMENT_PARSE_TIMEOUT_MS',
      20000,
      1000,
      60000,
      invalidVariables
    ),
    documentEmbeddingTimeoutMs: boundedInteger(
      'AI_TUTOR_DOCUMENT_EMBEDDING_TIMEOUT_MS',
      30000,
      5000,
      120000,
      invalidVariables
    ),
    documentEmbeddingModel:
      process.env.AI_TUTOR_DOCUMENT_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
    documentEmbeddingDimensions: boundedInteger(
      'AI_TUTOR_DOCUMENT_EMBEDDING_DIMENSIONS',
      768,
      128,
      3072,
      invalidVariables
    ),
    documentEmbeddingVersion:
      process.env.AI_TUTOR_DOCUMENT_EMBEDDING_VERSION?.trim() ||
      'gemini-embedding-001:768:v1',
    documentRetrievalChunks: boundedInteger(
      'AI_TUTOR_DOCUMENT_RETRIEVAL_CHUNKS',
      5,
      2,
      8,
      invalidVariables
    ),
    documentRetrievalMinScore: Number.isFinite(
      Number(process.env.AI_TUTOR_DOCUMENT_RETRIEVAL_MIN_SCORE)
    )
      ? Math.min(1, Math.max(0, Number(process.env.AI_TUTOR_DOCUMENT_RETRIEVAL_MIN_SCORE)))
      : 0.3,
    documentMaxContextChars: boundedInteger(
      'AI_TUTOR_DOCUMENT_MAX_CONTEXT_CHARS',
      14000,
      2000,
      30000,
      invalidVariables
    ),
    invalidVariables: Object.freeze(invalidVariables),
    consentVersion: CONSENT_VERSION,
    termsUrl: TERMS_URL,
  });
}

export function getAiTutorAvailability(config = getAiTutorConfig()) {
  if (!config.enabled) {
    return { available: false, code: 'AI_TUTOR_DISABLED', message: 'AI Tutor is currently unavailable.' };
  }
  if (!config.apiKey) {
    return {
      available: false,
      code: 'AI_TUTOR_NOT_CONFIGURED',
      message: 'AI Tutor is not configured yet. Please try again later.',
    };
  }
  if (config.invalidVariables?.length) {
    return {
      available: false,
      code: 'AI_TUTOR_NOT_CONFIGURED',
      message: 'AI Tutor configuration is invalid. Please try again later.',
    };
  }
  return { available: true, code: null, message: null };
}

export function describeAiTutorConfig(config = getAiTutorConfig()) {
  const availability = getAiTutorAvailability(config);
  console.log(
    `AI Tutor: ${availability.available ? 'available' : availability.code}; ` +
      `GEMINI_API_KEY=${config.apiKey ? 'set' : 'missing'}; ` +
      `model=${config.model}; documentRag=${config.documentRagEnabled ? 'enabled' : 'disabled'}; ` +
      `embeddingModel=${config.documentEmbeddingModel}; invalid=${config.invalidVariables?.length ? config.invalidVariables.join(',') : 'none'}`
  );
}

export { CONSENT_VERSION, TERMS_URL };
