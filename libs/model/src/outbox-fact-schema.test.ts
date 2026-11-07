import { expect, test } from 'bun:test';
import { outboxFactSchema } from './outbox-fact-schema.ts';

test('it parses an outbox row with its JSON payload', () => {
  const row = {
    seq: 1,
    factId: 'manual:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    type: 'boxxy.runner.paused',
    entity: 'boxxy:runner:runner-1',
    actor: 'boxxy:owner:local',
    at: 1500,
    payload: { runner: 'runner-1' },
    sentAt: null,
  };

  const parsed: unknown = outboxFactSchema.parse(row);

  expect(parsed).toStrictEqual(row);
});

test('it rejects an outbox row whose entity is not a boxxy entity', () => {
  const row = {
    seq: 1,
    factId: 'manual:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    type: 'boxxy.runner.paused',
    entity: 'pepys:stream:work',
    actor: 'boxxy:owner:local',
    at: 1500,
    payload: {},
    sentAt: null,
  };

  expect(() => outboxFactSchema.parse(row)).toThrow();
});
