import { setTimeout as sleep } from 'node:timers/promises';
import { buildInitialSenderState, buildOutboxStatus, runSenderOnce } from '@boxxy/dispatch';
import type { SenderDeps, SenderState, SenderTurn } from '@boxxy/dispatch';
import { match } from 'ts-pattern';
import type { OutboxControl, ServerLog } from '../types.ts';

export interface OutboxSenderInput extends SenderDeps {
  // the wait after a turn that found nothing to send
  readonly idleMs: number;
  readonly log: ServerLog;
}

export interface OutboxSender extends OutboxControl {
  // ends the loop after the turn in flight
  readonly stop: () => Promise<void>;
}

// The timer around the sender's turns. It waits as the last turn says, and a nudge, as after
// `outbox.retry`, ends the wait early. A turn that throws is logged, and the loop waits `idleMs`.
export function startOutboxSender(input: OutboxSenderInput): OutboxSender {
  let state: SenderState = buildInitialSenderState();
  let isSending = false;

  // set by `stop`, which runs outside the loop
  const run = { isStopped: false };

  let wake = new AbortController();

  const runLoop = async (): Promise<void> => {
    while (!run.isStopped) {
      const waitMs = await runTurn();

      if (waitMs > 0 && !run.isStopped) {
        await sleep(waitMs, null, { signal: wake.signal }).catch(() => null);
      }

      wake = wake.signal.aborted ? new AbortController() : wake;
    }
  };

  const runTurn = async (): Promise<number> => {
    isSending = true;

    try {
      const turn = await runSenderOnce(input, state);

      state = turn.state;

      return pickWaitMs(turn, input.clock.now(), input.idleMs);
    } catch (error) {
      input.log.warn('the outbox sender turn failed', { error: String(error) });

      return input.idleMs;
    } finally {
      isSending = false;
    }
  };

  const loop = runLoop();

  return {
    status: async () =>
      buildOutboxStatus({
        sink: 'pepys',
        state,
        counts: await input.store.read((tx) => tx.readOutboxCounts()),
        now: input.clock.now(),
        isSending,
      }),
    nudge: () => {
      wake.abort();
    },
    stop: async () => {
      run.isStopped = true;

      wake.abort();

      await loop;
    },
  };
}

function pickWaitMs(turn: SenderTurn, now: number, idleMs: number): number {
  return match(turn.step)
    .with('stored', 'split', 'parked', () => 0)
    .with('idle', () => idleMs)
    .with('retry', 'blocked', () => Math.max(0, (turn.state.nextTryAt ?? now) - now))
    .exhaustive();
}
