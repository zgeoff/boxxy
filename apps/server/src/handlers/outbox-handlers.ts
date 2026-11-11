import { api } from './api.ts';

// Clears the park mark of every parked row, then asks the sender for a turn, so the rows go out
// before its next timer.
export const outboxHandlers = {
  retry: api.outbox.retry.handler(async (options) => {
    const deps = options.context.deps;

    const unparked = await deps.store.exclusive((tx) => tx.unparkFacts());

    deps.outbox.nudge();

    return { unparked };
  }),
};
