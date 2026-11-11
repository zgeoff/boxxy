import type { z } from 'zod';
import type { brandSchemas } from '../rows/brand-schemas.ts';
import type { Instant, PhaseName } from '../types.ts';

// Where an item stands. The engine derives it on every read from the item's settled attempts,
// its retry levers and the rules loaded now; no row stores it. `round` is the item's round: 1,
// then one higher each time a backward edge or `item.retry --phase` sends the item back.
export type Position =
  | { readonly kind: 'phase'; readonly phase: PhaseName; readonly round: number }

  // `reviewed`, `pipeline-done` or `no-pipeline`
  | { readonly kind: 'end'; readonly reason: string }
  | {
      readonly kind: 'hold';
      readonly reason: HoldReason;
      readonly then: PhaseName;
      readonly round: number;
    };

export type HoldReason =
  | 'attempts used up'
  | 'rounds used up'
  | 'outcome not in rules'
  | RulesHoldReason;

// the reason that a `{ hold: reason }` edge of the rules names, such as `declined`
export type RulesHoldReason = z.output<typeof brandSchemas.rulesHoldReason>;

// What the engine reads of one settled attempt.
export interface Settled {
  readonly phase: PhaseName;

  // a phase outcome, or an engine outcome (`lost`, `unsettleable`)
  readonly outcome: string;
  readonly endedAt: Instant;

  // An attempt that failed with `no-capacity` or `usage-limit` neither moves the item nor
  // counts. Optional, so that a test's settled attempt may leave it out.
  readonly failure?: string | null;
}

export interface RetryLever {
  readonly at: Instant;

  // `boxxy item retry <item> --phase build`; null: the hold's `then`, or the position as it stands
  readonly phase: PhaseName | null;
}
