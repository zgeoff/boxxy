import { expect, test } from 'bun:test';
import { mergeReadingSchema } from './merge-reading-schema.ts';

test('it reads a merge that no read can observe, with its problem and pull request', () => {
  const parsed: unknown = mergeReadingSchema.parse({
    state: 'unreadable',
    problem: 'no-commit',
    pullRequest: { repo: 'acme/lamps', number: 7 },
  });

  expect(parsed).toStrictEqual({
    state: 'unreadable',
    problem: 'no-commit',
    pullRequest: { repo: 'acme/lamps', number: 7 },
  });
});

test('it reads an observation of an open pull request with its checks as a map', () => {
  const head = 'e83c5163316f89bfbde7d9ab23ca2e25604af290';

  const parsed: unknown = mergeReadingSchema.parse({
    pullRequest: { repo: 'acme/lamps', number: 7 },
    state: 'open',
    head,
    mergeable: 'clean',
    checks: { build: 'success' },
    baseRequired: [],
    mergeCommit: null,
    review: null,
    verify: { status: 'not-covered', head },
  });

  expect(parsed).toStrictEqual({
    pullRequest: { repo: 'acme/lamps', number: 7 },
    state: 'open',
    head,
    mergeable: 'clean',
    checks: new Map([['build', 'success']]),
    baseRequired: [],
    mergeCommit: null,
    review: null,
    verify: { status: 'not-covered', head },
  });
});

test('it reads a merge whose item has no pull request', () => {
  const parsed = mergeReadingSchema.parse({ state: 'unreadable', problem: 'no-pull-request' });

  expect(parsed).toStrictEqual({ state: 'unreadable', problem: 'no-pull-request' });
});

test('it refuses a read problem that the merge job never gives', () => {
  const parsed = mergeReadingSchema.safeParse({ state: 'unreadable', problem: 'forge-down' });

  expect(parsed.success).toBeFalse();
});

test('it refuses a missing pull request with no pull request named', () => {
  const parsed = mergeReadingSchema.safeParse({
    state: 'unreadable',
    problem: 'pull-request-not-found',
  });

  expect(parsed.success).toBeFalse();
});
