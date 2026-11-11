import { setTimeout as sleep } from 'node:timers/promises';
import type { ServerLog } from '../types.ts';

export interface TickLoop {
  // ends the loop after the tick in flight
  readonly stop: () => Promise<void>;
}

interface TickLoopInput {
  readonly runOnce: () => Promise<void>;
  readonly intervalMs: number;

  // the log line for a tick that throws
  readonly failureMessage: string;
  readonly log: ServerLog;
}

// Runs one tick, waits `intervalMs`, and runs the next. A tick that throws is logged, and the
// loop goes on; no two ticks overlap.
export function startTickLoop(input: TickLoopInput): TickLoop {
  const run = { isStopped: false, wake: new AbortController() };

  const runLoop = async (): Promise<void> => {
    while (!run.isStopped) {
      try {
        await input.runOnce();
      } catch (error) {
        input.log.warn(input.failureMessage, { error: String(error) });
      }

      await sleep(input.intervalMs, null, { signal: run.wake.signal }).catch(() => null);
    }
  };

  const loop = runLoop();

  return {
    stop: async () => {
      run.isStopped = true;

      run.wake.abort();

      await loop;
    },
  };
}
