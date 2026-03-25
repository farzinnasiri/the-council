'use node';

import { z } from 'zod';
import { createChatModel } from '../runtime/modelFactory';
import { modelRegistry } from '../runtime/modelRegistry';
import { invokeStructured } from '../runtime/structured';
import {
  normalizePersonalSourceLabels,
  normalizePersonalSourceQueryHints,
  personalSourceDocumentKindValues,
  personalSourceSemanticClassValues,
} from '../../personalSourcesShared';

const digestSchema = z.object({
  documentKinds: z.array(z.string()).default([]),
  semanticClasses: z.array(z.string()).default([]),
  queryHints: z.array(z.string()).default([]),
  voice: z.enum(['first_person', 'second_person', 'mixed', 'unknown']).default('unknown'),
});

function fallbackMetadata(displayName: string) {
  const lower = displayName.toLowerCase();
  return {
    documentKinds: [/(diary|journal)/.test(lower) ? 'diary' : /(essay)/.test(lower) ? 'essay' : 'mixed'],
    semanticClasses: ['reflection'],
    queryHints: normalizePersonalSourceQueryHints(
      lower
        .replace(/[^a-z0-9\s]+/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 4),
      10,
    ),
    voice: 'unknown' as const,
  };
}

export async function runPersonalSourceDigestGraph(input: {
  displayName: string;
  sampleText?: string;
  model?: string;
}): Promise<{
  documentKinds: string[];
  semanticClasses: string[];
  queryHints: string[];
  voice: 'first_person' | 'second_person' | 'mixed' | 'unknown';
  model: string;
}> {
  const target = modelRegistry.resolve('kbDigest', input.model);
  const model = createChatModel(target, { temperature: 0.1 });
  const fallback = fallbackMetadata(input.displayName);

  const prompt = [
    'Generate retrieval metadata for one personal source document.',
    'This is user-authored personal material and will be used for autobiographical retrieval.',
    'Return JSON only with keys: documentKinds, semanticClasses, queryHints, voice.',
    `documentKinds must stay within: ${personalSourceDocumentKindValues.join(', ')}`,
    `semanticClasses must stay within: ${personalSourceSemanticClassValues.join(', ')}`,
    'queryHints should be short retrieval anchors from the document.',
    'voice should describe whether the document is mostly first-person, second-person, mixed, or unknown.',
    '',
    `Document name: ${input.displayName}`,
    'Document sample:',
    (input.sampleText ?? '').slice(0, 8000) || '(unavailable)',
  ].join('\n');

  try {
    const parsed = await invokeStructured(model, prompt, digestSchema);
    const documentKinds = normalizePersonalSourceLabels(parsed.documentKinds, personalSourceDocumentKindValues, 4);
    const semanticClasses = normalizePersonalSourceLabels(parsed.semanticClasses, personalSourceSemanticClassValues, 8);
    const queryHints = normalizePersonalSourceQueryHints(parsed.queryHints, 16);
    return {
      documentKinds: documentKinds.length > 0 ? documentKinds : fallback.documentKinds,
      semanticClasses: semanticClasses.length > 0 ? semanticClasses : fallback.semanticClasses,
      queryHints: queryHints.length > 0 ? queryHints : fallback.queryHints,
      voice: parsed.voice,
      model: target.model,
    };
  } catch {
    return {
      ...fallback,
      model: target.model,
    };
  }
}
