import type { EngineOutcome } from '../types.ts';
import type { HoldReason } from './types.ts';

// the outcomes that only the engine writes; a phase kind lists neither
export const engineOutcomes = ['lost', 'unsettleable'] as const satisfies readonly EngineOutcome[];

// the holds that only the engine gives; the rules name none of them, so a report can tell the two apart
export const engineHoldReasons = [
  'attempts used up',
  'rounds used up',
  'outcome not in rules',
] as const satisfies readonly HoldReason[];
