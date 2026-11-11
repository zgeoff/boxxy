import { expect, test } from 'bun:test';
import { createFactBatchSender } from '@pepys/kit/send';
import { boxxySource } from '../boxxy-source.ts';
import { createIngestStandIn } from './create-ingest-stand-in.ts';

function setupTest() {
  const ingest = createIngestStandIn('a-test-secret');

  return {
    ingest,
    send: createFactBatchSender({
      source: boxxySource,
      url: 'http://ingest.test/boxxy/facts',
      secret: 'a-test-secret',
      fetch: ingest.handleRequest,
    }),
  };
}

test('it stores a valid batch once and drops a copy of an event', async () => {
  const ctx = setupTest();

  const first = {
    type: 'boxxy.item.noted',
    event: 'e-1',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    at: '2026-11-11T02:00:00.000Z',
    payload: { seq: 1, text: 'a note', storeVersion: 1 },
  } as const;

  const second = { ...first, event: 'e-2', payload: { ...first.payload, text: 'a second note' } };

  await ctx.send([first]);

  const answer = await ctx.send([first, second]);

  expect({ answer, stored: await ctx.ingest.readStored() }).toStrictEqual({
    answer: { ok: true, value: { stored: 2 } },
    stored: ['e-1', 'e-2'],
  });
});

test('it refuses a batch whole with 422 when one payload fails its family schema', async () => {
  const ctx = setupTest();

  const valid = {
    type: 'boxxy.item.noted',
    event: 'e-1',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    at: '2026-11-11T02:00:00.000Z',
    payload: { seq: 1, text: 'a note', storeVersion: 1 },
  } as const;

  const empty = { ...valid, event: 'e-2', payload: { ...valid.payload, text: '' } };

  const answer = await ctx.send([valid, empty]);

  expect({ answer, stored: await ctx.ingest.readStored() }).toStrictEqual({
    answer: { ok: false, failure: { kind: 'refused', status: 422, reason: expect.any(String) } },
    stored: [],
  });
});

test('it refuses a batch signed with another secret with 401', async () => {
  const ingest = createIngestStandIn('a-test-secret');

  const send = createFactBatchSender({
    source: boxxySource,
    url: 'http://ingest.test/boxxy/facts',
    secret: 'another-secret',
    fetch: ingest.handleRequest,
  });

  const answer = await send([
    {
      type: 'boxxy.item.noted',
      event: 'e-1',
      entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
      at: '2026-11-11T02:00:00.000Z',
      payload: { seq: 1, text: 'a note', storeVersion: 1 },
    },
  ]);

  expect(answer).toStrictEqual({
    ok: false,
    failure: { kind: 'refused', status: 401, reason: expect.any(String) },
  });
});
