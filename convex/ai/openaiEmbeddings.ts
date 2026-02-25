'use node';

import { OpenAIEmbeddings } from '@langchain/openai';
import { OPENAI_EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL } from './ragConfig';

function resolveOpenAiKey(): string {
  const key = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_KEY (or OPENAI_API_KEY) is not set in Convex runtime env');
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
    throw new Error('Cannot embed empty text');
  }

  const embedding = await embeddings.embedQuery(input);
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('OpenAI embeddings response missing embedding vector');
  }
  if (embedding.length !== OPENAI_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimensions: expected ${OPENAI_EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    );
  }

  return embedding;
}
