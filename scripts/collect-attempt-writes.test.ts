import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { collectAttemptWrites } from './collect-attempt-writes.ts';
import { readDispatchSources } from './read-dispatch-sources.ts';

test.each([
  ['an update of the attempts table', "const write = { op: 'update', table: 'attempts' };\n"],
  [
    'an insert into the attempt sessions table',
    'writes.push({ op: "insert", table: "attempt_sessions" });\n',
  ],
  ['a seat take', "return { op: 'take-seats', take };\n"],
  ['a seat release', "return { op: 'release-seats', release };\n"],
])('it lists a file outside the builder with %s', (_label, text) => {
  const files = new Map([
    ['attempts/build-attempt-change.ts', "const write = { table: 'attempts' };\n"],
    ['claims/claim-next.ts', text],
  ]);

  expect(collectAttemptWrites(files)).toStrictEqual(['claims/claim-next.ts']);
});

test('it leaves out the builder, tests and test-utils', () => {
  const text = "const write = { op: 'update', table: 'attempts' };\n";

  const files = new Map([
    ['attempts/build-attempt-change.ts', text],
    ['attempts/build-attempt-change.test.ts', text],
    ['test-utils/build-mock-start-change.ts', text],
    ['claims/claim-next.ts', 'const read = tx.readAttempt(id);\n'],
  ]);

  expect(collectAttemptWrites(files)).toStrictEqual([]);
});

test('it finds no attempt write outside the builder in modules/dispatch', () => {
  const files = readDispatchSources(join(import.meta.dir, '..'));

  expect(collectAttemptWrites(files)).toStrictEqual([]);
});
