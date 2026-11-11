import type { SenderState } from './types.ts';

export function buildInitialSenderState(): SenderState {
  return {
    queue: [],
    retries: 0,
    parkRun: 0,
    phase: 'idle',
    failingSince: null,
    nextTryAt: null,
    lastError: null,
    lastStoredAt: null,
  };
}
