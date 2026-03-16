'use node';

import { OpenAIEmbeddings } from '@langchain/openai';
import { OPENAI_EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL } from './ragConfig';
import { measureMainStage, incrementMainStat, setMainSpanAttributes } from '../observability/wideEvents';
import { wideEventError } from '../observability/errors';

function resolveOpenAiKey(): string {
  const key = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw wideEventError(
      'runtime-openai-key-missing',
      'OPENAI_KEY (or OPENAI_API_KEY) is not set in Convex runtime env'
    );
  }
  return key;
}

const embeddings = new OpenAIEmbeddings({
  apiKey: resolveOpenAiKey(),
  model: OPENAI_EMBEDDING_MODEL,
  dimensions: OPENAI_EMBEDDING_DIMENSIONS,
});

export async function embedText(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) {
    throw wideEventError('embedding-input-empty', 'Cannot embed empty text');
  }

  incrementMainStat('stats.embedding.query.count', 1);
  setMainSpanAttributes({ 'embedding.model': OPENAI_EMBEDDING_MODEL });
  const embedding = await measureMainStage('embedding.query', async () => await embeddings.embedQuery(input));
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw wideEventError('embedding-response-missing-vector', 'OpenAI embeddings response missing embedding vector');
  }
  if (embedding.length !== OPENAI_EMBEDDING_DIMENSIONS) {
    throw wideEventError(
      'embedding-dimensions-unexpected',
      `Unexpected embedding dimensions: expected ${OPENAI_EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    );
  }

  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const inputs = texts.map((text) => text.trim()).filter(Boolean);
  if (inputs.length === 0) {
    throw wideEventError('embedding-batch-empty', 'Cannot embed an empty text batch');
  }

  incrementMainStat('stats.embedding.batch.count', 1);
  setMainSpanAttributes({ 'embedding.model': OPENAI_EMBEDDING_MODEL });
  const vectors = await measureMainStage('embedding.batch', async () =>
    await embeddings.embedDocuments(inputs)
  );
  if (!Array.isArray(vectors) || vectors.length !== inputs.length) {
    throw wideEventError('embedding-response-missing-documents', 'OpenAI embeddings response missing document vectors');
  }

  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== OPENAI_EMBEDDING_DIMENSIONS) {
      throw wideEventError(
        'embedding-batch-dimensions-unexpected',
        `Unexpected embedding dimensions in batch: expected ${OPENAI_EMBEDDING_DIMENSIONS}`
      );
    }
  }

  return vectors;
}
