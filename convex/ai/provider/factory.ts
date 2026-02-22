'use node';

import { GeminiService } from '../geminiService';
import { GeminiCouncilAiProvider } from './geminiProvider';
import type { CouncilAiProvider } from './types';

export function createCouncilAiProvider(): CouncilAiProvider {
  return new GeminiCouncilAiProvider(new GeminiService(process.env.GEMINI_API_KEY));
}
