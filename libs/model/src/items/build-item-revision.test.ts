import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockOutboxFact } from '../test-utils/build-mock-outbox-fact.ts';
import { buildItemRevision } from './build-item-revision.ts';

test('it builds a revision that names each field an edit fact set, in name order', () => {
  const fact = buildMockOutboxFact({
    seq: 7,
    type: 'boxxy.item.edited',
    at: brandSchemas.instant.parse(4000),
    payload: { title: 'A new title', body: 'A new body', byAttempt: null },
  });

  expect(buildItemRevision(fact)).toStrictEqual({
    seq: 7,
    at: brandSchemas.instant.parse(4000),
    actor: 'boxxy:owner:local',
    changed: ['body', 'title'],
  });
});

test('it names the design mode in place of the fields object that holds it', () => {
  const fact = buildMockOutboxFact({
    type: 'boxxy.item.edited',
    payload: { fields: { designMode: 'attended' }, byAttempt: null },
  });

  expect(buildItemRevision(fact).changed).toStrictEqual(['designMode']);
});
