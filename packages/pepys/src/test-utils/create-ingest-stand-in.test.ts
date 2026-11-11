import { expect, test } from 'bun:test';
import { createIngestStandIn } from './create-ingest-stand-in.ts';

test('it stores a valid batch once and drops a copy of an event', async () => {
  const ingest = createIngestStandIn();

  const first = {
    type: 'boxxy.item.noted',
    event: 'e-1',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001' as const,
    at: '2026-11-11T02:00:00.000Z',
    payload: { seq: 1, text: 'a note', storeVersion: 1 },
  };

  const second = { ...first, event: 'e-2', payload: { ...first.payload, text: 'a second note' } };

  await ingest.send([first]);

  const answer = await ingest.send([first, second]);

  expect({ answer, stored: await ingest.readStored() }).toStrictEqual({
    answer: { ok: true, value: { stored: 2 } },
    stored: ['e-1', 'e-2'],
  });
});

test('it refuses a batch whole with 422 when one payload fails its family schema', async () => {
  const ingest = createIngestStandIn();

  const valid = {
    type: 'boxxy.item.noted',
    event: 'e-1',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001' as const,
    at: '2026-11-11T02:00:00.000Z',
    payload: { seq: 1, text: 'a note', storeVersion: 1 },
  };

  const empty = { ...valid, event: 'e-2', payload: { ...valid.payload, text: '' } };

  const answer = await ingest.send([valid, empty]);

  expect({ answer, stored: await ingest.readStored() }).toStrictEqual({
    answer: { ok: false, failure: { kind: 'refused', status: 422, reason: expect.any(String) } },
    stored: [],
  });
});

test('it refuses a batch of 101 facts with 413', async () => {
  const ingest = createIngestStandIn();

  const batch = Array.from({ length: 101 }, (_unused, index) => ({
    type: 'boxxy.item.noted',
    event: `e-${index}`,
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001' as const,
    at: '2026-11-11T02:00:00.000Z',
    payload: { seq: 1, text: 'a note', storeVersion: 1 },
  }));

  const answer = await ingest.send(batch);

  expect(answer).toStrictEqual({
    ok: false,
    failure: { kind: 'refused', status: 413, reason: expect.any(String) },
  });
});
