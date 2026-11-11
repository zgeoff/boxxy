import { expect, test } from 'bun:test';
import { loadRejectionSchema } from './load-rejection-schema.ts';

test.each([
  { kind: 'invalid', message: 'Expected a string' },
  { kind: 'uncommitted-changes' },
  { kind: 'unmapped-outcome', phase: 'review', outcome: 'passed' },
  { kind: 'engine-outcome-listed', phase: 'build', outcome: 'lost' },
])('it accepts a rejection for the reason $kind', (reason) => {
  const rejection = { file: 'rules.yaml', path: 'phases.review', reason };
  const parsed: unknown = loadRejectionSchema.safeParse(rejection).data;

  expect(parsed).toStrictEqual(rejection);
});

test('it rejects a rejection for a reason it does not know', () => {
  const rejection = { file: 'rules.yaml', path: '', reason: { kind: 'bad-mood' } };

  expect(loadRejectionSchema.safeParse(rejection).success).toBe(false);
});
