function terms(value) {
  return new Set(
    (String(value || '')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}_+#.-]{2,}/gu) || [])
      .map((term) => term.replace(/^[.-]+|[.-]+$/g, ''))
      .filter((term) => term.length >= 2)
  );
}

function cosine(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return -1;
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

function lexicalScore(queryTerms, text) {
  if (!queryTerms.size) return 0;
  const textTerms = terms(text);
  let matches = 0;
  for (const term of queryTerms) if (textTerms.has(term)) matches += 1;
  return matches / queryTerms.size;
}

function contentOverlap(left, right) {
  const leftTerms = terms(left);
  const rightTerms = terms(right);
  if (!leftTerms.size || !rightTerms.size) return 0;
  let shared = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) shared += 1;
  return shared / Math.min(leftTerms.size, rightTerms.size);
}

function overlaps(existing, candidate) {
  const samePdfPage = existing.source?.pageStart && candidate.source?.pageStart &&
    existing.source.pageStart === candidate.source.pageStart;
  const overlappingTextLines = existing.source?.lineStart && candidate.source?.lineStart && !(
    existing.source.lineEnd < candidate.source.lineStart - 3 ||
    candidate.source.lineEnd < existing.source.lineStart - 3
  );
  if (!samePdfPage && !overlappingTextLines) return false;

  // Adjacent chunks intentionally share a small sliding window, but each can
  // still contain unique evidence later in the page/section. Drop only a true
  // near-duplicate instead of discarding every neighbour from the same page.
  return contentOverlap(existing.text, candidate.text) >= 0.8;
}

export function retrieveChunks({ chunks, queryEmbedding, query, limit, minScore, maxContextChars }) {
  const queryTerms = terms(query);
  const ranked = chunks
    .map((chunk) => {
      const semantic = cosine(queryEmbedding, chunk.embedding);
      const lexical = lexicalScore(queryTerms, chunk.text);
      return { ...chunk, score: semantic * 0.82 + lexical * 0.18, semantic, lexical };
    })
    .sort((left, right) => right.score - left.score);

  const selected = [];
  let usedCharacters = 0;
  for (const chunk of ranked) {
    // A single shared/common word must not defeat the semantic threshold.
    // Lexical-only admission is reserved for a strong exact-term match.
    if (chunk.score < minScore && chunk.lexical < 0.67) continue;
    if (selected.some((existing) => overlaps(existing, chunk))) continue;
    if (usedCharacters + chunk.text.length > maxContextChars && selected.length > 0) continue;
    selected.push(chunk);
    usedCharacters += chunk.text.length;
    if (selected.length >= limit) break;
  }
  return selected;
}

export function sourceLabel(source) {
  if (source?.pageStart) {
    return source.pageStart === source.pageEnd
      ? `Page ${source.pageStart}`
      : `Pages ${source.pageStart}-${source.pageEnd}`;
  }
  return source?.lineStart === source?.lineEnd
    ? `Line ${source.lineStart}`
    : `Lines ${source.lineStart}-${source.lineEnd}`;
}

export { cosine, lexicalScore, terms };
