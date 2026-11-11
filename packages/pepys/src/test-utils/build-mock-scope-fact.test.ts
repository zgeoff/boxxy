import { expect, test } from 'bun:test';
import { buildMockScopeFact } from './build-mock-scope-fact.ts';

test('it builds a fact with the fact ID that ingest gives the event, and the time as ISO text', () => {
  const fact = buildMockScopeFact('boxxy.attempt.slept', {
    event: 'f09',
    at: '2026-11-11T02:30:00.000Z',
  });

  expect({ id: fact.id, type: fact.type, at: fact.at }).toStrictEqual({
    id: 'event:boxxy:f09',
    type: 'boxxy.attempt.slept',
    at: '2026-11-11T02:30:00.000Z',
  });
});

test('it throws for a payload that the model schema of the type refuses', () => {
  expect(() =>
    buildMockScopeFact('boxxy.attempt.settled', { payload: { asleep: 'yes' } }),
  ).toThrow();
});
