function terms(value) {
  return new Set(
    String(value || '')
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}_+#.-]{2,}/gu) || []
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

function overlaps(existing, candidate) {
  if (existing.source?.pageStart && candidate.source?.pageStart) {
    return existing.source.pageStart === candidate.source.pageStart &&
      Math.abs(existing.ordinal - candidate.ordinal) <= 1;
  }
  if (existing.source?.lineStart && candidate.source?.lineStart) {
    return !(
      existing.source.lineEnd < candidate.source.lineStart - 3 ||
      candidate.source.lineEnd < existing.source.lineStart - 3
    );
  }
  return false;
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
