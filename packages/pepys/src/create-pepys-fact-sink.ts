import type { FactSink } from '@boxxy/model';
import type { FactBatchSend, SendResult } from './kit/types.ts';
import { pickSinkAnswer } from './sink/pick-sink-answer.ts';
import { toWireFact } from './sink/to-wire-fact.ts';

interface PepysFactSinkOptions {
  // the kit's batch sender for the boxxy source: it builds the body, signs it and posts it
  readonly send: FactBatchSend;
  readonly timeoutMs: number;
}

// The sink holds no HTTP code. The kit's sender takes no abort signal of the caller's, so the sink
// races it with a timer; a late answer is dropped, and the rows stay unsent.
export function createPepysFactSink(options: PepysFactSinkOptions): FactSink {
  return {
    send: async (facts) => {
      const sent = await withTimeout(
        options.send(facts.map((fact) => toWireFact(fact))),
        options.timeoutMs,
      );

      return pickSinkAnswer(sent, options.timeoutMs);
    },
  };
}

async function withTimeout(sending: Promise<SendResult>, timeoutMs: number) {
  const timer = Promise.withResolvers<'timeout'>();
  const handle = setTimeout(() => timer.resolve('timeout'), timeoutMs);

  try {
    return await Promise.race([sending, timer.promise]);
  } finally {
    clearTimeout(handle);
  }
}
