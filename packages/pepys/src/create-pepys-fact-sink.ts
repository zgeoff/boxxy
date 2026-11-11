import type { FactSink } from '@boxxy/model';
import { createFactBatchSender } from '@pepys/kit/send';
import { boxxySource } from './boxxy-source.ts';
import { isOutgoingFact } from './sink/is-outgoing-fact.ts';
import { pickSinkAnswer } from './sink/pick-sink-answer.ts';
import { toWireFact } from './sink/to-wire-fact.ts';

interface PepysFactSinkOptions {
  // the URL of the source's receive route on pepys ingest
  readonly url: string;

  // the value of `PEPYS_BOXXY_SIGNING_SECRET` in the pepys deployment
  readonly secret: string;
  readonly timeoutMs: number;

  // the global `fetch` when left out; a test passes ingest's route
  readonly fetch?: (request: Request) => Promise<Response>;
}

// The sink holds no HTTP code: the kit's sender builds the body, signs it and posts it. The sender
// takes no abort signal of the caller's, so the sink races it with a timer; a late answer is
// dropped, and the rows stay unsent. The kit's sender throws on an empty secret.
export function createPepysFactSink(options: PepysFactSinkOptions): FactSink {
  const send = createFactBatchSender({
    source: boxxySource,
    url: options.url,
    secret: options.secret,
    fetch: options.fetch,
  });

  return {
    send: async (facts) => {
      const wire = facts.map((fact) => toWireFact(fact));
      const outgoing = wire.filter((fact) => isOutgoingFact(fact));

      // ingest would refuse the batch whole with 422 for the same fact
      if (outgoing.length < wire.length) {
        return {
          kind: 'refused-batch',
          status: 422,
          reason: 'a fact does not fit its type in the boxxy fact family',
        };
      }

      const sent = await withTimeout(send(outgoing), options.timeoutMs);

      return pickSinkAnswer(sent, options.timeoutMs);
    },
  };
}

async function withTimeout<Value>(sending: Promise<Value>, timeoutMs: number) {
  const timer = Promise.withResolvers<'timeout'>();

  const handle = setTimeout(() => {
    timer.resolve('timeout');
  }, timeoutMs);

  try {
    return await Promise.race([sending, timer.promise]);
  } finally {
    clearTimeout(handle);
  }
}
