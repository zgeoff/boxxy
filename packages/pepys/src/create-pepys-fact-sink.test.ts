import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { OutboxFact } from '@boxxy/model';
import { buildMockOutboxFact } from '@boxxy/model/test-utils/build-mock-outbox-fact';
import { factSinkContract } from '@boxxy/model/test-utils/fact-sink-contract';
import { createPepysFactSink } from './create-pepys-fact-sink.ts';
import type { SendResult, WireFact } from './kit/types.ts';
import { createIngestStandIn } from './test-utils/create-ingest-stand-in.ts';

function setupTest() {
  const ingest = createIngestStandIn();

  return {
    harness: {
      sink: createPepysFactSink({ send: ingest.send, timeoutMs: 10_000 }),
      readStored: async () => {
        const stored = await ingest.readStored();

        return stored.map((event) => brandSchemas.factId.parse(event));
      },
      corrupt: (fact: OutboxFact): OutboxFact => ({ ...fact, payload: { text: '' } }),
    },
  };
}

test.each(factSinkContract)('it keeps the FactSink contract: %s', async (_title, check) => {
  const ctx = setupTest();

  const outcome = await check(ctx.harness);

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('it sends each row as a wire fact with its fact ID as the event and the store version in the payload', async () => {
  const sent: WireFact[][] = [];

  const sink = createPepysFactSink({
    send: (facts) => {
      sent.push([...facts]);

      return Promise.resolve({ ok: true, value: { stored: facts.length } });
    },
    timeoutMs: 10_000,
  });

  const fact = buildMockOutboxFact({ seq: 7 });

  await sink.send([fact]);

  expect(sent).toStrictEqual([
    [
      {
        type: 'boxxy.item.noted',
        event: fact.factId,
        entity: 'boxxy:item:i-7',
        actor: 'boxxy:owner:local',
        at: '2027-01-15T08:00:00.007Z',
        payload: { seq: 7, text: 'a note', storeVersion: 7 },
      },
    ],
  ]);
});

test('it answers retry when the sender gives no answer in the time limit', async () => {
  const never = Promise.withResolvers<SendResult>();
  const sink = createPepysFactSink({ send: () => never.promise, timeoutMs: 5 });

  const answer = await sink.send([buildMockOutboxFact()]);

  expect(answer).toStrictEqual({ kind: 'retry', reason: 'no answer in 5 ms' });
});
