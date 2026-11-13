import { buildInitialSenderState, outboxLimits, runSenderOnce } from '@boxxy/dispatch';
import type { SenderStep } from '@boxxy/dispatch';
import type { ClaimStore, Clock, FactSink } from '@boxxy/model';

interface OutboxSenderInput {
  readonly store: ClaimStore;
  readonly sink: FactSink;
  readonly clock: Clock;
}

// The server's outbox sender with no timer: it takes turns until a turn finds nothing to send or
// must wait, and returns the step of each turn. A wait ends the run, because the server's timer
// is what would wait.
export async function runOutboxSender(input: OutboxSenderInput): Promise<SenderStep[]> {
  const deps = { ...input, limits: outboxLimits, random: () => 0 };
  const steps: SenderStep[] = [];
  let state = buildInitialSenderState();

  for (;;) {
    const turn = await runSenderOnce(deps, state);

    state = turn.state;

    steps.push(turn.step);

    if (turn.step === 'idle' || turn.step === 'retry' || turn.step === 'blocked') {
      return steps;
    }
  }
}
