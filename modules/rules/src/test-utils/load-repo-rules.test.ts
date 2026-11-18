import { expect, test } from 'bun:test';
import { loadRepoRules } from './load-repo-rules.ts';

test('it loads the build and review pipeline with the repos section it is given', () => {
  const result = loadRepoRules({ repos: {} });

  expect(result.kind).toBe('loaded');
});
