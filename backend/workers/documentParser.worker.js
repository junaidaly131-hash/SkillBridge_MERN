import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

function pageText(items) {
  let text = '';
  for (const item of items) {
    if (typeof item?.str !== 'string') continue;
    text += item.str;
    text += item.hasEOL ? '\n' : ' ';
  }
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parsePdf(buffer, maxPages, maxCharacters) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
    disableAutoFetch: true,
    useWorkerFetch: false,
    verbosity: 0,
  });

  try {
    const document = await loadingTask.promise;
    if (document.numPages > maxPages) {
      const error = new Error('DOCUMENT_TOO_MANY_PAGES');
      error.code = 'DOCUMENT_TOO_MANY_PAGES';
      throw error;
    }
    const pages = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      const text = pageText(content.items);
      characterCount += text.length;
      if (characterCount > maxCharacters) {
        const error = new Error('DOCUMENT_TOO_MUCH_TEXT');
        error.code = 'DOCUMENT_TOO_MUCH_TEXT';
        throw error;
      }
      pages.push({ pageNumber, text });
      page.cleanup();
    }
    return { pageCount: document.numPages, pages };
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

process.on('message', async ({ buffer, maxPages, maxCharacters }) => {
  try {
    process.send?.({ ok: true, result: await parsePdf(buffer, maxPages, maxCharacters) });
  } catch (error) {
    const name = String(error?.name || 'Error');
    const message = String(error?.message || '');
    const passwordProtected = name === 'PasswordException' || /password/i.test(message);
    process.send?.({
      ok: false,
      error: passwordProtected
        ? 'PDF_PASSWORD_PROTECTED'
        : ['DOCUMENT_TOO_MANY_PAGES', 'DOCUMENT_TOO_MUCH_TEXT'].includes(error?.code)
          ? error.code
          : 'PDF_MALFORMED',
    });
  } finally {
    process.disconnect?.();
  }
});
