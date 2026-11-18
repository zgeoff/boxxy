import { expect, test } from 'bun:test';
import { outboxFactSchema } from './outbox-fact-schema.ts';

test('it parses an outbox row with its JSON payload', () => {
  const row = {
    seq: 1,
    factId: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    type: 'boxxy.item.noted',
    entity: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70',
    actor: 'boxxy:owner:local',
    at: 1500,
    payload: { seq: 1, text: 'The lamp flickers on start.' },
    sentAt: null,
    parkedAt: 1600,
    parkedReason: 'too-large',
  };

  const parsed: unknown = outboxFactSchema.parse(row);

  expect(parsed).toStrictEqual(row);
});

test('it parses an outbox row of a runner fact', () => {
  const row = {
    seq: 2,
    factId: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b78',
    type: 'boxxy.runner.paused',
    entity: 'boxxy:runner:runner-1',
    actor: 'boxxy:owner:local',
    at: 1700,
    payload: { runner: 'runner-1', reason: 'rules change in review' },
    sentAt: null,
    parkedAt: null,
    parkedReason: null,
  };

  const parsed: unknown = outboxFactSchema.parse(row);

  expect(parsed).toStrictEqual(row);
});

test.each([
  ['an entity that is not an item or a runner', { entity: 'boxxy:attempt:a1' }],
  ['a type outside the catalog', { type: 'boxxy.runner.stopped' }],
])('it rejects an outbox row with %s', (_title, override) => {
  const row = {
    seq: 1,
    factId: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    type: 'boxxy.item.noted',
    entity: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70',
    actor: 'boxxy:owner:local',
    at: 1500,
    payload: {},
    sentAt: null,
    parkedAt: null,
    parkedReason: null,
    ...override,
  };

  expect(() => outboxFactSchema.parse(row)).toThrow();
});
