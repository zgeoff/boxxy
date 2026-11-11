import { expect, test } from 'bun:test';
import { buildMockAppliedFact } from './build-mock-applied-fact.ts';
import { toScopeFact } from './to-scope-fact.ts';

test('it gives the fact the ID that ingest gives its event, and keeps the fields the fold reads', () => {
  const fact = toScopeFact(
    buildMockAppliedFact('boxxy.pull_request.linked', {
      event: 'f08',
      at: '2026-11-11T02:25:00.000Z',
      entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
      payload: { attempt: '0193a1b2-0000-7000-8000-0000000000a2', pullRequestId: '9001' },
    }),
  );

  expect(fact).toStrictEqual({
    id: 'event:boxxy:f08',
    type: 'boxxy.pull_request.linked',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    at: '2026-11-11T02:25:00.000Z',
    payload: { attempt: '0193a1b2-0000-7000-8000-0000000000a2', pullRequestId: '9001' },
  });
});
