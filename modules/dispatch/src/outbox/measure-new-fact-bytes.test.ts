import { expect, test } from 'bun:test';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import type { AnyNewFact, OutboxFact } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { measureNewFactBytes } from './measure-new-fact-bytes.ts';
import { measureWireBytes } from './measure-wire-bytes.ts';

test('it counts at least the bytes of the stored fact with any store version', () => {
  const fact: AnyNewFact = {
    id: buildMockFactId(),
    type: 'boxxy.item.noted',
    entity: 'boxxy:item:i-1',
    actor: 'boxxy:owner:local',
    payload: { seq: 1, text: 'abc' },
  };

  const stored: OutboxFact = {
    seq: 7,
    factId: fact.id,
    type: 'boxxy.item.noted',
    entity: fact.entity,
    actor: fact.actor,
    at: brandSchemas.instant.parse(1000),
    payload: toJSONValue(fact.payload),
    sentAt: null,
    parkedAt: null,
    parkedReason: null,
  };

  expect(measureNewFactBytes(fact)).toBeGreaterThanOrEqual(measureWireBytes(stored));
});

test('it counts a multi-byte character by its UTF-8 bytes', () => {
  const ascii: AnyNewFact = {
    id: buildMockFactId(),
    type: 'boxxy.item.noted',
    entity: 'boxxy:item:i-1',
    actor: 'boxxy:owner:local',
    payload: { seq: 1, text: 'aaaa' },
  };

  const wide: AnyNewFact = { ...ascii, payload: { seq: 1, text: '€€€€' } };

  expect(measureNewFactBytes(wide) - measureNewFactBytes(ascii)).toBe(8);
});
