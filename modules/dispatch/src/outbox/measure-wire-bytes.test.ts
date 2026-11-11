import { expect, test } from 'bun:test';
import { buildMockOutboxFact } from '@boxxy/model/test-utils/build-mock-outbox-fact';
import { measureWireBytes } from './measure-wire-bytes.ts';

test('it counts the bytes of the wire item, with the store version in the payload', () => {
  const fact = buildMockOutboxFact({ seq: 12, payload: { text: 'abc' } });

  const wire = {
    type: fact.type,
    event: fact.factId,
    entity: fact.entity,
    actor: fact.actor,
    at: '2027-01-15T08:00:00.012Z',
    payload: { text: 'abc', storeVersion: 12 },
  };

  expect(measureWireBytes(fact)).toBe(new TextEncoder().encode(JSON.stringify(wire)).length);
});

test('it counts a multi-byte character by its UTF-8 bytes', () => {
  const ascii = buildMockOutboxFact({ seq: 1, payload: { text: 'aaaa' } });
  const wide = buildMockOutboxFact({ seq: 1, payload: { text: '€€€€' } });

  expect(measureWireBytes(wide) - measureWireBytes(ascii)).toBe(8);
});
