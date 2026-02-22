'use node';

import { OPENAI_EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL } from './ragConfig';

function resolveOpenAiKey(): string {
  const key = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_KEY (or OPENAI_API_KEY) is not set in Convex runtime env');
  }
  return key;
}

export async function embedText(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) {
    throw new Error('Cannot embed empty text');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolveOpenAiKey()}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings error (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = payload.data?.[0]?.embedding;
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
