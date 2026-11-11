import { expect, test } from 'bun:test';
import { buildMockOutboxFact } from '@boxxy/model/test-utils/build-mock-outbox-fact';
import { outboxLimits } from './constants.ts';
import { measureWireBytes } from './measure-wire-bytes.ts';
import { takeBatch } from './take-batch.ts';

function setupTest() {
  return {
    buildRows: (count: number) =>
      Array.from({ length: count }, (_unused, index) => buildMockOutboxFact({ seq: index + 1 })),
  };
}

test('it takes no facts from no rows', () => {
  expect(takeBatch([], outboxLimits)).toStrictEqual({ kind: 'batch', facts: [] });
});

test('it takes 100 rows of 150, in order', () => {
  const ctx = setupTest();
  const rows = ctx.buildRows(150);

  expect(takeBatch(rows, outboxLimits)).toStrictEqual({ kind: 'batch', facts: rows.slice(0, 100) });
});

test('it stops before the row that would pass the byte budget of the batch', () => {
  const rows = [
    buildMockOutboxFact({ seq: 1, payload: { text: 'a'.repeat(200_000) } }),
    buildMockOutboxFact({ seq: 2, payload: { text: 'b'.repeat(200_000) } }),
    buildMockOutboxFact({ seq: 3, payload: { text: 'c'.repeat(200_000) } }),
    buildMockOutboxFact({ seq: 4, payload: { text: 'd'.repeat(200_000) } }),
    buildMockOutboxFact({ seq: 5, payload: { text: 'e'.repeat(200_000) } }),
  ];

  expect(takeBatch(rows, outboxLimits)).toStrictEqual({ kind: 'batch', facts: rows.slice(0, 4) });
});

test('it returns a first row over the fact limit alone as oversize', () => {
  const big = buildMockOutboxFact({ seq: 1, payload: { text: 'a'.repeat(262_144) } });
  const ctx = setupTest();
  const rows = [big, ...ctx.buildRows(2)];

  expect(takeBatch(rows, outboxLimits)).toStrictEqual({ kind: 'oversize', fact: big });
});

test('it ends the batch before an oversize row that is not the first', () => {
  const big = buildMockOutboxFact({ seq: 3, payload: { text: 'a'.repeat(262_144) } });
  const ctx = setupTest();
  const rows = [...ctx.buildRows(2), big];

  expect(takeBatch(rows, outboxLimits)).toStrictEqual({ kind: 'batch', facts: rows.slice(0, 2) });
});

test('it takes a row of exactly the fact limit', () => {
  const base = buildMockOutboxFact({ seq: 1, payload: { text: '' } });
  const fill = outboxLimits.factBytes - measureWireBytes(base);
  const edge = buildMockOutboxFact({ seq: 1, payload: { text: 'a'.repeat(fill) } });

  expect(takeBatch([edge], outboxLimits)).toStrictEqual({ kind: 'batch', facts: [edge] });
});
