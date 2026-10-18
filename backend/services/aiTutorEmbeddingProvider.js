import { GoogleGenAI } from '@google/genai';
import { AiTutorProviderError } from './aiTutorProvider.js';

function normalize(values, dimensions) {
  if (!Array.isArray(values) || values.length !== dimensions) {
    throw new AiTutorProviderError('EMBEDDING_INCOMPATIBLE');
  }
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + Number(value) ** 2, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new AiTutorProviderError('EMBEDDING_INVALID');
  }
  return values.map((value) => Number(value) / magnitude);
}

export function createGeminiEmbeddingProvider(config, dependencies = {}) {
  const ai = dependencies.ai || new GoogleGenAI({ apiKey: config.apiKey });

  async function embed(contents, taskType, title) {
    try {
      const response = await ai.models.embedContent({
        model: config.documentEmbeddingModel,
        contents,
        config: {
          taskType,
          ...(title && taskType === 'RETRIEVAL_DOCUMENT' ? { title } : {}),
          outputDimensionality: config.documentEmbeddingDimensions,
          httpOptions: {
            timeout: config.documentEmbeddingTimeoutMs,
            retryOptions: { attempts: 1 },
          },
        },
      });
      const embeddings = response?.embeddings || [];
      if (embeddings.length !== contents.length) throw new AiTutorProviderError('EMBEDDING_INVALID');
      return embeddings.map((entry) => normalize(entry?.values, config.documentEmbeddingDimensions));
    } catch (error) {
      if (error instanceof AiTutorProviderError) throw error;
      const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
      const message = String(error?.message || '').toLowerCase();
      if (status === 429) throw new AiTutorProviderError('EMBEDDING_QUOTA');
      if (status === 401 || status === 403) throw new AiTutorProviderError('PROVIDER_CONFIG');
      if (message.includes('timeout')) throw new AiTutorProviderError('EMBEDDING_TIMEOUT');
      if (!status || status >= 500) throw new AiTutorProviderError('EMBEDDING_UNAVAILABLE');
      throw new AiTutorProviderError('EMBEDDING_ERROR');
    }
  }

  return {
    async embedDocuments(chunks, title) {
      const output = [];
      for (let index = 0; index < chunks.length; index += 20) {
        output.push(...(await embed(chunks.slice(index, index + 20), 'RETRIEVAL_DOCUMENT', title)));
      }
      return output;
    },
    async embedQuery(text) {
      return (await embed([text], 'RETRIEVAL_QUERY'))[0];
    },
  };
}

export { normalize as normalizeEmbedding };
