import { expect, test } from 'bun:test';
import { buildMockOutboxFact } from '@boxxy/model/test-utils/build-mock-outbox-fact';
import { createFakeFactSink } from './create-fake-fact-sink.ts';
import { factSinkContract } from './fact-sink-contract.ts';

function setupTest() {
  const fake = createFakeFactSink();

  return {
    fake,
    harness: {
      sink: fake,
      readStored: () => Promise.resolve([...fake.facts.keys()]),
      corrupt: (fact: ReturnType<typeof buildMockOutboxFact>) => {
        fake.refuseFact(fact.factId, 422);

        return fact;
      },
    },
  };
}

test.each(factSinkContract)('it keeps the FactSink contract: %s', async (_title, check) => {
  const ctx = setupTest();

  const outcome = await check(ctx.harness);

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('#answerNext plays its answers for the next calls and then answers as ingest does', async () => {
  const ctx = setupTest();
  const batch = [buildMockOutboxFact()];

  ctx.fake.answerNext({ kind: 'retry', reason: 'connection refused' });

  const first = await ctx.fake.send(batch);
  const second = await ctx.fake.send(batch);

  expect([first, second]).toStrictEqual([
    { kind: 'retry', reason: 'connection refused' },
    { kind: 'stored' },
  ]);
});

test('#answerNext with retry stores nothing, and its sends list the fact IDs of every call', async () => {
  const ctx = setupTest();
  const fact = buildMockOutboxFact();

  ctx.fake.answerNext({ kind: 'retry', reason: 'timeout' });

  await ctx.fake.send([fact]);

  expect(ctx.fake.facts.size).toBe(0);
  expect(ctx.fake.sends).toStrictEqual([[fact.factId]]);
});

test('#refuseFact refuses a batch with the given status', async () => {
  const ctx = setupTest();
  const fact = buildMockOutboxFact();

  ctx.fake.refuseFact(fact.factId, 413);

  const answer = await ctx.fake.send([fact]);

  expect(answer).toMatchObject({ kind: 'refused-batch', status: 413 });
});
