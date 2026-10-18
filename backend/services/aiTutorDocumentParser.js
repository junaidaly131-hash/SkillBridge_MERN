import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ALLOWED_MIME = Object.freeze({
  pdf: new Set(['application/pdf']),
  txt: new Set(['text/plain']),
});

export class DocumentParseError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DocumentParseError';
    this.code = code;
  }
}

export function safeDisplayName(value) {
  const leaf = String(value || 'document')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return (leaf || 'document').slice(0, 180);
}

export function validateUploadEnvelope(file, maxBytes) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new DocumentParseError('DOCUMENT_FILE_REQUIRED');
  }
  if (file.buffer.length > maxBytes) throw new DocumentParseError('DOCUMENT_FILE_TOO_LARGE');

  const displayName = safeDisplayName(file.originalname);
  const extension = displayName.toLowerCase().split('.').pop();
  if (!ALLOWED_MIME[extension]) throw new DocumentParseError('DOCUMENT_UNSUPPORTED_TYPE');
  if (!ALLOWED_MIME[extension].has(String(file.mimetype || '').toLowerCase())) {
    throw new DocumentParseError('DOCUMENT_TYPE_MISMATCH');
  }

  if (extension === 'pdf' && file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new DocumentParseError('DOCUMENT_TYPE_MISMATCH');
  }
  if (extension === 'txt' && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    throw new DocumentParseError('DOCUMENT_TYPE_MISMATCH');
  }
  return { displayName, fileType: extension, mimeType: ALLOWED_MIME[extension].values().next().value };
}

function parseTxt(buffer) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new DocumentParseError('DOCUMENT_INVALID_UTF8');
  }
  const sample = text.slice(0, 10000);
  const invalidControls = [...sample].filter((character) => {
    const code = character.charCodeAt(0);
    return code === 0 || (code < 32 && !['\n', '\r', '\t'].includes(character));
  }).length;
  if (text.includes('\u0000') || invalidControls > Math.max(4, sample.length * 0.01)) {
    throw new DocumentParseError('DOCUMENT_BINARY_TEXT');
  }
  return { pageCount: 0, text: text.replace(/\r\n?/g, '\n').trim() };
}

function parsePdfInIsolatedProcess(buffer, timeoutMs, maxPages, maxCharacters) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('../workers/documentParser.worker.js', import.meta.url)), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
      execArgv: ['--max-old-space-size=128'],
    });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.connected) child.disconnect();
      child.kill();
      callback(value);
    };
    const timer = setTimeout(
      () => finish(reject, new DocumentParseError('DOCUMENT_PARSE_TIMEOUT')),
      timeoutMs
    );
    child.once('message', (message) => {
      if (message?.ok) finish(resolve, message.result);
      else finish(reject, new DocumentParseError(message?.error || 'PDF_MALFORMED'));
    });
    child.once('error', () => finish(reject, new DocumentParseError('PDF_MALFORMED')));
    child.once('exit', (code) => {
      if (!settled && code !== 0) finish(reject, new DocumentParseError('PDF_MALFORMED'));
    });
    child.send({ buffer, maxPages, maxCharacters });
  });
}

export async function parseUploadedDocument(file, config) {
  const envelope = validateUploadEnvelope(file, config.documentMaxFileBytes);
  const parsed =
    envelope.fileType === 'pdf'
      ? await parsePdfInIsolatedProcess(
          file.buffer,
          config.documentParseTimeoutMs,
          config.documentMaxPages,
          config.documentMaxCharacters
        )
      : parseTxt(file.buffer);

  if (parsed.pageCount > config.documentMaxPages) {
    throw new DocumentParseError('DOCUMENT_TOO_MANY_PAGES');
  }
  const extractedText =
    envelope.fileType === 'pdf'
      ? parsed.pages.map((page) => page.text).join('\n\n')
      : parsed.text;
  const characterCount = extractedText.length;
  if (characterCount > config.documentMaxCharacters) {
    throw new DocumentParseError('DOCUMENT_TOO_MUCH_TEXT');
  }
  const meaningfulCharacters = extractedText.replace(/\s/g, '').length;
  const minimumPdfText = Math.max(80, (parsed.pageCount || 1) * 20);
  if (!meaningfulCharacters || (envelope.fileType === 'pdf' && meaningfulCharacters < minimumPdfText)) {
    throw new DocumentParseError(
      envelope.fileType === 'pdf' ? 'DOCUMENT_SCANNED_OR_EMPTY' : 'DOCUMENT_EMPTY'
    );
  }

  return { ...envelope, ...parsed, characterCount };
}
