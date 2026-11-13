import { expect, test } from 'bun:test';
import { mergeObservationSchema } from './merge-observation-schema.ts';

test('it reads the checks of the JSON form as a map by name', () => {
  const head = 'e83c5163316f89bfbde7d9ab23ca2e25604af290';

  const parsed = mergeObservationSchema.parse({
    pullRequest: { repo: 'acme/lamps', number: 7 },
    state: 'open',
    head,
    mergeable: 'clean',
    checks: { build: 'success', 'verify / gate': 'pending' },
    baseRequired: ['build'],
    mergeCommit: null,
    review: null,
    verify: { status: 'not-covered', head },
  });

  expect(parsed.checks).toStrictEqual(
    new Map([
      ['build', 'success'],
      ['verify / gate', 'pending'],
    ]),
  );
});

test('it refuses a check state that the forge never reads', () => {
  const head = 'e83c5163316f89bfbde7d9ab23ca2e25604af290';

  const parsed = mergeObservationSchema.safeParse({
    pullRequest: { repo: 'acme/lamps', number: 7 },
    state: 'open',
    head,
    mergeable: 'clean',
    checks: { build: 'red' },
    baseRequired: ['build'],
    mergeCommit: null,
    review: null,
    verify: { status: 'not-covered', head },
  });

  expect(parsed.success).toBeFalse();
});
