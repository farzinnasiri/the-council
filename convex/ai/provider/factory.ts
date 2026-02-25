'use node';

import { LangChainCouncilAiProvider } from './langchainProvider';
import type { CouncilAiProvider } from './types';

export function createCouncilAiProvider(): CouncilAiProvider {
  return new LangChainCouncilAiProvider();
}
