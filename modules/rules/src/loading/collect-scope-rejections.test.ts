import { expect, test } from 'bun:test';
import type { SpawnScope } from '@boxxy/model';
import { loadRepoRules } from '../test-utils/load-repo-rules.ts';

test('it rejects a repo recipe whose agent is scoped to another repo', () => {
  const spawn: SpawnScope = {
    agents: { 'scoped-agent': { phases: ['review'], repos: ['example/app'] } },
    phases: {},
    repos: ['example/app', 'example/other'],
  };

  const result: unknown = loadRepoRules({
    repos: { 'example/other': { recipes: { review: 'scoped' } } },
    spawn,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'repos["example/other"].recipes.review',
        reason: {
          kind: 'agent-outside-scope',
          itemKind: 'core.issue',
          phase: 'review',
          recipe: 'scoped',
          agent: 'scoped-agent',
          repo: 'example/other',
        },
      },
    ],
  });
});

test('it rejects a kind recipe on a scoped agent for a repo that does not override it', () => {
  const spawn: SpawnScope = {
    agents: { 'scoped-agent': { phases: ['review'], repos: ['example/app'] } },
    phases: {},
    repos: ['example/app', 'example/other'],
  };

  const result: unknown = loadRepoRules({
    repos: {},
    kindRecipes: { build: 'plain', review: 'scoped' },
    spawn,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'kinds["core.issue"].recipes.review',
        reason: {
          kind: 'agent-outside-scope',
          itemKind: 'core.issue',
          phase: 'review',
          recipe: 'scoped',
          agent: 'scoped-agent',
          repo: 'example/other',
        },
      },
    ],
  });
});

test('it loads a kind recipe on a scoped agent once each repo outside its scope overrides it', () => {
  const spawn: SpawnScope = {
    agents: { 'scoped-agent': { phases: ['review'], repos: ['example/app'] } },
    phases: {},
    repos: ['example/app', 'example/other'],
  };

  const result = loadRepoRules({
    repos: { 'example/other': { recipes: { review: 'plain' } } },
    kindRecipes: { build: 'plain', review: 'scoped' },
    spawn,
  });

  expect(result.kind).toBe('loaded');
});

test('it rejects a repo recipe on an unscoped agent for a phase that needs a scoped one', () => {
  const spawn: SpawnScope = {
    agents: { 'scoped-agent': { phases: ['review'] } },
    phases: { review: { requireScopedAgent: true } },
    repos: ['example/app'],
  };

  const result: unknown = loadRepoRules({
    repos: { 'example/app': { recipes: { review: 'plain' } } },
    kindRecipes: { build: 'plain', review: 'scoped' },
    spawn,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'repos["example/app"].recipes.review',
        reason: {
          kind: 'phase-without-scoped-agent',
          itemKind: 'core.issue',
          phase: 'review',
          recipe: 'plain',
          agent: 'claude',
        },
      },
    ],
  });
});

test('it rejects a resume edge into a phase that a repo runs on a scoped agent', () => {
  const spawn: SpawnScope = {
    agents: { 'scoped-agent': { phases: ['build'] } },
    phases: {},
    repos: ['example/app'],
  };

  const result: unknown = loadRepoRules({
    repos: { 'example/app': { recipes: { build: 'scoped' } } },
    steps: [
      { phase: 'build', maxAttempts: 2, timeoutMinutes: 60, on: { built: 'next' } },
      {
        phase: 'review',
        maxAttempts: 2,
        timeoutMinutes: 60,
        on: { passed: { end: 'done' }, failed: { to: 'build', max: 2, resume: true } },
      },
    ],
    spawn,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pipelines.standard[1].on.failed',
        reason: {
          kind: 'scoped-agent-session-resumed',
          phase: 'review',
          outcome: 'failed',
          to: 'build',
        },
      },
    ],
  });
});
