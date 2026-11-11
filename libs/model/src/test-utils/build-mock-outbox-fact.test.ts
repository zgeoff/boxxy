import { expect, test } from 'bun:test';
import { outboxFactSchema } from '../facts/outbox-fact-schema.ts';
import { buildMockOutboxFact } from './build-mock-outbox-fact.ts';

test('it builds a row that the outbox row schema accepts', () => {
  expect(outboxFactSchema.safeParse(buildMockOutboxFact()).success).toBe(true);
});

test('it takes the entity and the time from the sequence number, and keeps an override', () => {
  const built = buildMockOutboxFact({ seq: 7, parkedReason: 'too-large' });

  expect(built).toMatchObject({ seq: 7, entity: 'boxxy:item:i-7', parkedReason: 'too-large' });
});
