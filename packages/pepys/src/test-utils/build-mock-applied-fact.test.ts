import { expect, test } from 'bun:test';
import { buildMockAppliedFact } from './build-mock-applied-fact.ts';

test('it builds a fact of a batch with the event and the time as ISO text', () => {
  const fact = buildMockAppliedFact('boxxy.attempt.slept', {
    event: 'f09',
    at: '2026-11-11T02:30:00.000Z',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  expect({
    type: fact.type,
    event: fact.event,
    entity: fact.entity,
    at: fact.at,
  }).toStrictEqual({
    type: 'boxxy.attempt.slept',
    event: 'f09',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    at: '2026-11-11T02:30:00.000Z',
  });
});

test('it throws for a payload that the model schema of the type refuses', () => {
  expect(() =>
    buildMockAppliedFact('boxxy.attempt.settled', { payload: { asleep: 'yes' } }),
  ).toThrow();
});
