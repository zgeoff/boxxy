import type { Instant, OutboxStatus } from '@boxxy/model';
import type { SenderState } from './types.ts';

const msPerMinute = 60_000;

interface OutboxStatusInput {
  readonly sink: 'pepys' | 'none';
  readonly state: SenderState;
  readonly counts: {
    readonly unsent: number;
    readonly parked: number;
    readonly oldestUnsentAt: Instant | null;
  };
  readonly now: Instant;

  // a batch is in flight
  readonly isSending: boolean;
}

export function buildOutboxStatus(input: OutboxStatusInput): OutboxStatus {
  return {
    sink: input.sink,
    state: pickState(input),
    unsent: input.counts.unsent,
    parked: input.counts.parked,
    lag:
      input.counts.oldestUnsentAt === null
        ? null
        : Math.max(0, Math.floor((input.now - input.counts.oldestUnsentAt) / msPerMinute)),
    failingSince: input.state.failingSince,
    nextTryAt: input.state.nextTryAt,
    lastError: input.state.lastError,
    lastStoredAt: input.state.lastStoredAt,
  };
}

function pickState(input: OutboxStatusInput): OutboxStatus['state'] {
  if (input.sink === 'none') {
    return 'off';
  }

  return input.isSending ? 'sending' : input.state.phase;
}
