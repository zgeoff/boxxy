import { expect, test } from 'bun:test';
import { outboxFactSchema } from '../facts/outbox-fact-schema.ts';
import { workFactSchemas } from '../facts/work-fact-schemas.ts';
import { buildMockWorkFact } from './build-mock-work-fact.ts';

test.each([
  'boxxy.item.filed',
  'boxxy.item.edited',
  'boxxy.item.closed',
  'boxxy.attempt.claimed',
  'boxxy.attempt.started',
  'boxxy.attempt.reconciled',
  'boxxy.attempt.resumed',
  'boxxy.attempt.session_bound',
  'boxxy.attempt.slept',
  'boxxy.attempt.woken',
  'boxxy.attempt.closed_out',
  'boxxy.attempt.settled',
  'boxxy.pull_request.linked',
] as const)('it builds a %s row whose payload its schema accepts', (type) => {
  const fact = buildMockWorkFact(type);

  expect({
    row: outboxFactSchema.safeParse(fact).success,
    payload: workFactSchemas[type].safeParse(fact.payload).success,
  }).toStrictEqual({ row: true, payload: true });
});

test('it keeps the payload fields, the time and the entity that the test gives', () => {
  const fact = buildMockWorkFact('boxxy.attempt.settled', {
    payload: { outcome: 'passed', round: 2 },
    at: 1_800_000_060_000,
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });

  expect(fact).toMatchObject({
    at: 1_800_000_060_000,
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    payload: { outcome: 'passed', round: 2, state: 'succeeded' },
  });
});

test('it throws for a payload field that the schema of the type refuses', () => {
  expect(() => buildMockWorkFact('boxxy.attempt.claimed', { payload: { round: 0 } })).toThrow();
});
