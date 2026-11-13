import { runOutboxSender } from '@boxxy/server/test-utils/run-outbox-sender';
import { ControlConflictError } from './control-conflict-error.ts';
import type { VerifyHarness } from './types.ts';

// Runs the outbox sender into pepys under test until it is idle.
export async function drainOutbox(harness: VerifyHarness): Promise<{ sent: number }> {
  const steps = await runOutboxSender({
    store: harness.server.deps.store,
    sink: harness.pepys.sink,
    clock: harness.server.dispatch.clock,
  });

  const counts = await harness.server.deps.store.read((tx) => tx.readOutboxCounts());

  if (steps.at(-1) !== 'idle' || counts.parked > 0 || counts.unsent > 0) {
    throw new ControlConflictError(
      `the outbox did not drain: ${counts.unsent} unsent, ${counts.parked} parked`,
    );
  }

  return { sent: steps.length };
}
