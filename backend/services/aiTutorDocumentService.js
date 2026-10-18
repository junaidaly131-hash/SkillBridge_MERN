import crypto from 'node:crypto';
import { getAiTutorAvailability } from '../config/aiTutor.js';
import { chunkDocument } from './aiTutorChunking.js';
import { DocumentParseError, parseUploadedDocument, validateUploadEnvelope } from './aiTutorDocumentParser.js';
import { AiTutorProviderError } from './aiTutorProvider.js';
import { retrieveChunks, sourceLabel } from './aiTutorRetrieval.js';

const DOCUMENT_ERRORS = {
  DOCUMENT_RAG_DISABLED: [503, 'Document chat is currently unavailable.'],
  DOCUMENT_CONSENT_REQUIRED: [428, 'Review and accept the document processing notice before uploading.'],
  DOCUMENT_FILE_REQUIRED: [400, 'Choose a PDF or TXT file to upload.'],
  DOCUMENT_FILE_TOO_LARGE: [413, 'This file is larger than the allowed upload size.'],
  DOCUMENT_UNSUPPORTED_TYPE: [415, 'Only text-based PDF and UTF-8 TXT files are supported.'],
  DOCUMENT_TYPE_MISMATCH: [415, 'The file content does not match its name and declared type.'],
  DOCUMENT_INVALID_UTF8: [422, 'TXT documents must use valid UTF-8 text.'],
  DOCUMENT_BINARY_TEXT: [422, 'This TXT file appears to contain binary data.'],
  DOCUMENT_EMPTY: [422, 'This document does not contain any readable text.'],
  DOCUMENT_SCANNED_OR_EMPTY: [422, 'This PDF does not contain enough extractable text. Please upload a text-based PDF or TXT file.'],
  DOCUMENT_TOO_MANY_PAGES: [413, 'This PDF has more pages than the current limit.'],
  DOCUMENT_TOO_MUCH_TEXT: [413, 'This document contains more text than the current limit.'],
  DOCUMENT_TOO_MANY_CHUNKS: [413, 'This document is too complex for the current indexing limit.'],
  DOCUMENT_PARSE_TIMEOUT: [504, 'Document parsing took too long. Try a smaller document.'],
  PDF_PASSWORD_PROTECTED: [422, 'Password-protected PDFs are not supported.'],
  PDF_MALFORMED: [422, 'This PDF is malformed or could not be safely read.'],
  DOCUMENT_UPLOAD_LIMIT: [429, "You've reached today's document upload attempt limit."],
  DOCUMENT_ACTIVE_LIMIT: [409, 'Delete an existing document before uploading another one.'],
  DOCUMENT_PROCESSING_IN_PROGRESS: [409, 'Another document is already being processed for your account.'],
  DOCUMENT_QUEUE_FULL: [503, 'Document processing is busy. Please try again shortly.'],
  DOCUMENT_GLOBAL_EMBEDDING_LIMIT: [503, 'Document indexing has reached today’s shared limit. Try again after midnight UTC.'],
  DOCUMENT_NOT_FOUND: [404, 'Document not found.'],
  DOCUMENT_NOT_READY: [409, 'This document is not ready for questions yet.'],
  DOCUMENT_INDEX_INCOMPATIBLE: [409, 'This document uses an older index version. Re-upload it to continue.'],
  DOCUMENT_DELETED_DURING_REQUEST: [409, 'This document was deleted while the answer was being prepared.'],
  EMBEDDING_QUOTA: [503, 'Document indexing is busy because its provider limit was reached.'],
  EMBEDDING_TIMEOUT: [504, 'Document indexing took too long. Try again later.'],
  EMBEDDING_UNAVAILABLE: [503, 'Document indexing is temporarily unavailable.'],
  EMBEDDING_INCOMPATIBLE: [502, 'The embedding provider returned an incompatible index.'],
  EMBEDDING_INVALID: [502, 'The embedding provider returned an invalid index.'],
  EMBEDDING_ERROR: [502, 'Document indexing could not be completed.'],
};

export class AiTutorDocumentError extends Error {
  constructor(code) {
    const [status, message] = DOCUMENT_ERRORS[code] || [500, 'Document processing could not be completed.'];
    super(message);
    this.name = 'AiTutorDocumentError';
    this.code = code;
    this.status = status;
  }
}

export class BoundedProcessingQueue {
  constructor(concurrency, maxPending = concurrency * 4) {
    this.concurrency = concurrency;
    this.maxPending = maxPending;
    this.active = 0;
    this.pending = [];
  }

  acquire() {
    if (this.active < this.concurrency) {
      this.active += 1;
      return Promise.resolve(this.release.bind(this));
    }
    if (this.pending.length >= this.maxPending) throw new AiTutorDocumentError('DOCUMENT_QUEUE_FULL');
    return new Promise((resolve) => this.pending.push(resolve));
  }

  release() {
    const next = this.pending.shift();
    if (next) next(this.release.bind(this));
    else this.active = Math.max(0, this.active - 1);
  }
}

function publicDocument(document) {
  if (!document) return null;
  return {
    id: String(document._id || document.id),
    displayName: document.displayName,
    fileType: document.fileType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    failureCategory: document.failureCategory || null,
    pageCount: document.pageCount || 0,
    extractedCharacterCount: document.extractedCharacterCount || 0,
    chunkCount: document.chunkCount || 0,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function safeFailureCode(error) {
  if (error instanceof AiTutorDocumentError || error instanceof DocumentParseError) return error.code;
  if (error instanceof AiTutorProviderError) return error.code;
  return 'DOCUMENT_PROCESSING_FAILED';
}

export class AiTutorDocumentService {
  constructor({ config, repository, embeddingProvider, queue, logger = console, now = () => new Date() }) {
    this.config = config;
    this.repository = repository;
    this.embeddingProvider = embeddingProvider;
    this.queue = queue || new BoundedProcessingQueue(config.documentGlobalProcessingConcurrency);
    this.logger = logger;
    this.now = now;
  }

  assertEnabled() {
    const availability = getAiTutorAvailability(this.config);
    if (!availability.available || !this.config.documentRagEnabled) {
      throw new AiTutorDocumentError('DOCUMENT_RAG_DISABLED');
    }
  }

  async list(owner) {
    await this.repository.recoverStaleProcessing(owner, this.now());
    return { documents: (await this.repository.listDocuments(owner)).map(publicDocument) };
  }

  async getReady(owner, documentId) {
    const document = await this.repository.findDocument(owner, documentId);
    if (!document) throw new AiTutorDocumentError('DOCUMENT_NOT_FOUND');
    if (document.status !== 'ready') throw new AiTutorDocumentError('DOCUMENT_NOT_READY');
    if (
      document.embeddingVersion !== this.config.documentEmbeddingVersion ||
      document.embeddingModel !== this.config.documentEmbeddingModel ||
      document.embeddingDimensions !== this.config.documentEmbeddingDimensions
    ) {
      throw new AiTutorDocumentError('DOCUMENT_INDEX_INCOMPATIBLE');
    }
    return document;
  }

  async upload(owner, file, hasConsent) {
    this.assertEnabled();
    if (!hasConsent) throw new AiTutorDocumentError('DOCUMENT_CONSENT_REQUIRED');
    const envelope = validateUploadEnvelope(file, this.config.documentMaxFileBytes);
    const contentHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.repository.findReadyDuplicate(
      owner,
      contentHash,
      this.config.documentEmbeddingVersion
    );
    if (duplicate) return { document: publicDocument(duplicate), duplicate: true };

    const token = crypto.randomUUID();
    const ingestionTtlMs =
      this.config.documentParseTimeoutMs +
      Math.ceil(this.config.documentMaxChunks / 20) * this.config.documentEmbeddingTimeoutMs +
      60000;
    if (!(await this.repository.acquireIngestionLock(owner, token, ingestionTtlMs))) {
      throw new AiTutorDocumentError('DOCUMENT_PROCESSING_IN_PROGRESS');
    }

    let releaseQueue;
    let globalSlot = null;
    let document;
    const startedAt = Date.now();
    try {
      if ((await this.repository.countActiveDocuments(owner)) >= this.config.documentMaxActivePerUser) {
        throw new AiTutorDocumentError('DOCUMENT_ACTIVE_LIMIT');
      }
      if (!(await this.repository.reserveUploadAttempt(owner, this.config, this.now()))) {
        throw new AiTutorDocumentError('DOCUMENT_UPLOAD_LIMIT');
      }
      releaseQueue = await this.queue.acquire();
      globalSlot = await this.repository.acquireGlobalIngestionSlot(
        token,
        this.config.documentGlobalProcessingConcurrency,
        ingestionTtlMs
      );
      if (globalSlot === null) throw new AiTutorDocumentError('DOCUMENT_QUEUE_FULL');
      document = await this.repository.createProcessingDocument({
        owner,
        ...envelope,
        sizeBytes: file.buffer.length,
        contentHash,
        processingToken: token,
        processingExpiresAt: new Date(this.now().getTime() + ingestionTtlMs),
      });

      const parsed = await parseUploadedDocument(file, this.config);
      if (!(await this.repository.reserveEmbeddingCharacters(parsed.characterCount, this.config, this.now()))) {
        throw new AiTutorDocumentError('DOCUMENT_GLOBAL_EMBEDDING_LIMIT');
      }
      const rawChunks = chunkDocument(parsed);
      if (!rawChunks.length) throw new AiTutorDocumentError('DOCUMENT_EMPTY');
      if (rawChunks.length > this.config.documentMaxChunks) {
        throw new AiTutorDocumentError('DOCUMENT_TOO_MANY_CHUNKS');
      }
      const embeddings = await this.embeddingProvider.embedDocuments(
        rawChunks.map((chunk) => chunk.text),
        envelope.displayName
      );
      const chunks = rawChunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
        embeddingVersion: this.config.documentEmbeddingVersion,
      }));
      const documentId = document._id || document.id;
      if (!(await this.repository.insertChunks(owner, documentId, token, chunks))) {
        throw new AiTutorDocumentError('DOCUMENT_DELETED_DURING_REQUEST');
      }
      const ready = await this.repository.finalizeDocument(owner, documentId, token, {
        pageCount: parsed.pageCount,
        extractedCharacterCount: parsed.characterCount,
        chunkCount: chunks.length,
        embeddingModel: this.config.documentEmbeddingModel,
        embeddingDimensions: this.config.documentEmbeddingDimensions,
        embeddingVersion: this.config.documentEmbeddingVersion,
      });
      if (!ready) throw new AiTutorDocumentError('DOCUMENT_DELETED_DURING_REQUEST');
      this.logger.info?.(
        `[ai-tutor-documents] indexed ${JSON.stringify({ documentId: String(documentId), durationMs: Date.now() - startedAt, pageCount: parsed.pageCount, characterCount: parsed.characterCount, chunkCount: chunks.length })}`
      );
      return { document: publicDocument(ready), duplicate: false };
    } catch (error) {
      const code = safeFailureCode(error);
      if (document) {
        await this.repository.failDocument(owner, document._id || document.id, token, code);
      }
      this.logger.info?.(
        `[ai-tutor-documents] failed ${JSON.stringify({ documentId: document ? String(document._id || document.id) : null, durationMs: Date.now() - startedAt, category: code })}`
      );
      if (error instanceof AiTutorDocumentError) throw error;
      if (error instanceof DocumentParseError || error instanceof AiTutorProviderError) {
        throw new AiTutorDocumentError(error.code);
      }
      throw new AiTutorDocumentError('DOCUMENT_PROCESSING_FAILED');
    } finally {
      if (globalSlot !== null) await this.repository.releaseGlobalIngestionSlot(token);
      releaseQueue?.();
      await this.repository.releaseIngestionLock(owner, token);
    }
  }

  async retrieve(owner, documentId, question, history) {
    const document = await this.getReady(owner, documentId);
    const chunks = await this.repository.loadCompatibleChunks(
      owner,
      documentId,
      this.config.documentEmbeddingVersion,
      this.config.documentMaxChunks + 1
    );
    if (!chunks.length || chunks.length > this.config.documentMaxChunks) {
      throw new AiTutorDocumentError('DOCUMENT_INDEX_INCOMPATIBLE');
    }
    const followUpContext = history
      .slice(-4)
      .map((message) => message.text)
      .join('\n')
      .slice(-2000);
    const retrievalQuery = followUpContext ? `${followUpContext}\nCurrent question: ${question}` : question;
    const queryEmbedding = await this.embeddingProvider.embedQuery(retrievalQuery);
    const selected = retrieveChunks({
      chunks,
      queryEmbedding,
      query: question,
      limit: this.config.documentRetrievalChunks,
      minScore: this.config.documentRetrievalMinScore,
      maxContextChars: this.config.documentMaxContextChars,
    });
    return {
      document,
      sources: selected.map((chunk, index) => ({
        sourceId: `S${index + 1}`,
        chunkId: String(chunk._id || chunk.id),
        label: sourceLabel(chunk.source),
        text: chunk.text,
        source: chunk.source,
        score: chunk.score,
      })),
    };
  }

  async delete(owner, documentId) {
    const document = await this.repository.markDeleting(owner, documentId);
    if (!document) throw new AiTutorDocumentError('DOCUMENT_NOT_FOUND');
    const cleanup = await this.repository.deleteDocumentContent(owner, documentId);
    return { deleted: true, ...cleanup };
  }

  async source(owner, conversationId, messageId, chunkId) {
    const result = await this.repository.getMessageSource(owner, conversationId, messageId, chunkId);
    if (!result) throw new AiTutorDocumentError('DOCUMENT_NOT_FOUND');
    return {
      sourceId: result.sourceId,
      filename: result.document.displayName,
      fileType: result.document.fileType,
      label: result.label,
      excerpt: result.chunk.text,
      location: result.chunk.source,
    };
  }
}

export { DOCUMENT_ERRORS, publicDocument };
