const TARGET_CHARACTERS = 2400;
const OVERLAP_CHARACTERS = 400;

function chooseEnd(text, start) {
  const hardEnd = Math.min(text.length, start + TARGET_CHARACTERS);
  if (hardEnd === text.length) return hardEnd;
  const floor = start + Math.floor(TARGET_CHARACTERS * 0.65);
  const candidates = ['\n\n', '\n', '. ', '! ', '? ', '۔ '];
  let best = -1;
  for (const boundary of candidates) {
    const index = text.lastIndexOf(boundary, hardEnd);
    if (index >= floor) best = Math.max(best, index + boundary.length);
  }
  return best >= floor ? best : hardEnd;
}

function chunkText(text, sourceFactory) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = chooseEnd(text, start);
    const value = text.slice(start, end).trim();
    if (value) chunks.push({ text: value, source: sourceFactory(start, end) });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - OVERLAP_CHARACTERS);
  }
  return chunks;
}

function lineAt(offset, starts) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(1, high + 1);
}

export function chunkDocument(parsed) {
  const chunks = [];
  if (parsed.fileType === 'pdf') {
    for (const page of parsed.pages) {
      chunks.push(
        ...chunkText(page.text, () => ({
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          lineStart: null,
          lineEnd: null,
        }))
      );
    }
  } else {
    const text = parsed.text;
    const lineStarts = [0];
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '\n') lineStarts.push(index + 1);
    }
    chunks.push(
      ...chunkText(text, (start, end) => ({
        pageStart: null,
        pageEnd: null,
        lineStart: lineAt(start, lineStarts),
        lineEnd: lineAt(Math.max(start, end - 1), lineStarts),
      }))
    );
  }
  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

export { OVERLAP_CHARACTERS, TARGET_CHARACTERS };
