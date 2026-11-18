import { expect, test } from 'bun:test';
import { isOutgoingFact } from './is-outgoing-fact.ts';

test.each([
  [
    'a runner pause',
    { type: 'boxxy.runner.paused', entity: 'boxxy:runner:runner-1' },
    { runner: 'runner-1', reason: null, storeVersion: 1 },
    true,
  ],
  [
    'a runner resume',
    { type: 'boxxy.runner.resumed', entity: 'boxxy:runner:runner-1' },
    { runner: 'runner-1', storeVersion: 2 },
    true,
  ],
  [
    'a runner pause on an item entity',
    { type: 'boxxy.runner.paused', entity: 'boxxy:item:i-1' },
    { runner: 'runner-1', reason: null, storeVersion: 1 },
    false,
  ],
  [
    'an item note on a runner entity',
    { type: 'boxxy.item.noted', entity: 'boxxy:runner:runner-1' },
    { seq: 1, text: 'A note', storeVersion: 1 },
    false,
  ],
  [
    'a runner pause with no store version',
    { type: 'boxxy.runner.paused', entity: 'boxxy:runner:runner-1' },
    { runner: 'runner-1', reason: null },
    false,
  ],
  [
    'an item note',
    { type: 'boxxy.item.noted', entity: 'boxxy:item:i-1' },
    { seq: 1, text: 'A note', storeVersion: 1 },
    true,
  ],
  [
    'a type outside both families',
    { type: 'boxxy.runner.stopped', entity: 'boxxy:runner:runner-1' },
    { runner: 'runner-1', storeVersion: 1 },
    false,
  ],
])('it judges %s', (_title, name, payload, expected) => {
  const fact = {
    ...name,
    event: 'e1',
    actor: 'boxxy:owner:local',
    at: '2026-01-01T00:00:00.000Z',
    payload,
  };

  expect(isOutgoingFact(fact)).toBe(expected);
});
