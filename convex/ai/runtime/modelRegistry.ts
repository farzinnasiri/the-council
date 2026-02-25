import { resolveModelTarget, type ModelSlot, type ModelTarget } from '../modelConfig';

export class ModelRegistry {
  resolve(slot: ModelSlot, override?: string): ModelTarget {
    return resolveModelTarget(slot, override);
  }
}

export const modelRegistry = new ModelRegistry();
