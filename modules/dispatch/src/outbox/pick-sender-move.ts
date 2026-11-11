import type { SinkAnswer } from '@boxxy/model';
import { match } from 'ts-pattern';
import type { OutboxLimits, SenderMove } from './types.ts';

interface SenderMoveInput {
  readonly answer: SinkAnswer;
  readonly batchSize: number;

  // rows parked since the last `stored`
  readonly parkRun: number;
  readonly limits: OutboxLimits;
}

const versionSkewReason = 'pepys refuses every fact';

// What the sender does with each answer of the sink.
export function pickSenderMove(input: SenderMoveInput): SenderMove {
  return match(input.answer)
    .with({ kind: 'stored' }, (): SenderMove => ({ kind: 'mark-sent' }))
    .with({ kind: 'retry' }, (): SenderMove => ({ kind: 'retry-same' }))
    .with({ kind: 'refused-sink' }, (refused): SenderMove => ({
      kind: 'block',
      reason: refused.reason,
    }))
    .with({ kind: 'refused-batch' }, (refused): SenderMove => {
      if (input.batchSize > 1) {
        return { kind: 'split' };
      }

      if (input.parkRun >= input.limits.parkRun) {
        return { kind: 'block', reason: versionSkewReason };
      }

      return { kind: 'park', reason: refused.status === 413 ? 'too-large' : refused.reason };
    })
    .exhaustive();
}
