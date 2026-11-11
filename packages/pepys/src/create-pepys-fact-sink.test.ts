import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { OutboxFact } from '@boxxy/model';
import { buildMockOutboxFact } from '@boxxy/model/test-utils/build-mock-outbox-fact';
import { factSinkContract } from '@boxxy/model/test-utils/fact-sink-contract';
import { createPepysFactSink } from './create-pepys-fact-sink.ts';
import { createIngestStandIn } from './test-utils/create-ingest-stand-in.ts';

function setupTest() {
  const ingest = createIngestStandIn('a-test-secret');

  return {
    harness: {
      sink: createPepysFactSink({
        url: 'http://ingest.test/boxxy/facts',
        secret: 'a-test-secret',
        timeoutMs: 10_000,
        fetch: ingest.handleRequest,
      }),
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

test('it posts each row with its fact ID as the event and the store version in the payload', async () => {
  const bodies: unknown[] = [];

  const handleRequest = async (request: Request) => {
    const body: unknown = await request.json();

    bodies.push(body);

    return Response.json({ status: 'stored', stored: 1 });
  };

  const sink = createPepysFactSink({
    url: 'http://ingest.test/boxxy/facts',
    secret: 'a-test-secret',
    timeoutMs: 10_000,
    fetch: handleRequest,
  });

  const fact = buildMockOutboxFact({ seq: 7 });

  await sink.send([fact]);

  expect(bodies).toStrictEqual([
    expect.objectContaining({
      facts: [
        {
          type: 'boxxy.item.noted',
          event: fact.factId,
          entity: 'boxxy:item:i-7',
          actor: 'boxxy:owner:local',
          at: '2027-01-15T08:00:00.007Z',
          payload: { seq: 7, text: 'a note', storeVersion: 7 },
        },
      ],
    }),
  ]);
});

test('it answers refused-sink for a 500 from ingest', async () => {
  const reason = 'the log refused the append';
  const handleRequest = () => Promise.resolve(new Response(reason, { status: 500 }));

  const sink = createPepysFactSink({
    url: 'http://ingest.test/boxxy/facts',
    secret: 'a-test-secret',
    timeoutMs: 10_000,
    fetch: handleRequest,
  });

  const answer = await sink.send([buildMockOutboxFact()]);

  expect(answer).toStrictEqual({
    kind: 'refused-sink',
    status: 500,
    reason,
  });
});

test('it answers refused-batch with 422 and sends nothing for a fact that its type refuses', async () => {
  const requests: Request[] = [];

  const handleRequest = (request: Request) => {
    requests.push(request);

    return Promise.resolve(Response.json({ status: 'stored', stored: 1 }));
  };

  const sink = createPepysFactSink({
    url: 'http://ingest.test/boxxy/facts',
    secret: 'a-test-secret',
    timeoutMs: 10_000,
    fetch: handleRequest,
  });

  const answer = await sink.send([buildMockOutboxFact({ payload: { seq: 1, text: '' } })]);

  expect({ kind: answer.kind, requests: requests.length }).toStrictEqual({
    kind: 'refused-batch',
    requests: 0,
  });
});

test('it answers retry when the sender gives no answer in the time limit', async () => {
  const never = Promise.withResolvers<Response>();
  const handleRequest = () => never.promise;

  const sink = createPepysFactSink({
    url: 'http://ingest.test/boxxy/facts',
    secret: 'a-test-secret',
    timeoutMs: 5,
    fetch: handleRequest,
  });

  const answer = await sink.send([buildMockOutboxFact()]);

  expect(answer).toStrictEqual({ kind: 'retry', reason: 'no answer in 5 ms' });
});
