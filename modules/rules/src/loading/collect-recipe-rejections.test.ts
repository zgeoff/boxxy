import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { loadRepoRules } from '../test-utils/load-repo-rules.ts';

test('it loads a repo recipe map into the repo policy', () => {
  const result = loadRepoRules({
    repos: { 'example/app': { recipes: { review: 'scoped', 'review/attended': 'plain' } } },
  });

  invariant(result.kind === 'loaded', 'the rules load');

  const policy: unknown = result.rules.repos.get(brandSchemas.repoName.parse('example/app'));

  expect(policy).toStrictEqual({
    ships: 'none',
    recipes: { review: 'scoped', 'review/attended': 'plain' },
  });
});

test('it rejects a repo recipe that names a recipe the file lacks', () => {
  const result: unknown = loadRepoRules({
    repos: { 'example/app': { recipes: { review: 'nope' } } },
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'repos["example/app"].recipes.review',
        reason: { kind: 'missing-repo-recipe', repo: 'example/app', phase: 'review' },
      },
    ],
  });
});

test('it rejects a repo recipe that wakes the kept session before any build step', () => {
  const result: unknown = loadRepoRules({
    repos: { 'example/app': { recipes: { build: 'plain-builder' } } },
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'repos["example/app"].recipes.build',
        reason: { kind: 'builder-session-not-kept', recipe: 'plain-builder' },
      },
    ],
  });
});

test.each([
  { title: 'end', edge: { end: 'done', notify: true } },
  { title: 'hold', edge: { hold: 'blocked', notify: true } },
  { title: 'to', edge: { to: 'build', max: 2, notify: true } },
])('it loads a $title edge with notify', (row) => {
  const result = loadRepoRules({
    repos: {},
    steps: [
      { phase: 'build', maxAttempts: 2, timeoutMinutes: 60, on: { built: 'next' } },
      {
        phase: 'review',
        maxAttempts: 2,
        timeoutMinutes: 60,
        on: { passed: { end: 'done' }, failed: row.edge },
      },
    ],
  });

  invariant(result.kind === 'loaded', 'the rules load');

  const kind = brandSchemas.itemKindName.parse('core.issue');
  const edge: unknown = result.rules.kinds.get(kind)?.pipeline.steps.at(1)?.on['failed'];

  expect(edge).toStrictEqual(row.edge);
});
