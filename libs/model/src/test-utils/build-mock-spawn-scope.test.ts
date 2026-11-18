import { expect, test } from 'bun:test';
import { buildMockSpawnScope } from './build-mock-spawn-scope.ts';

test('it builds a scope with a review agent and a review phase that needs it', () => {
  expect(buildMockSpawnScope()).toStrictEqual({
    agents: { 'claude-review': { phases: ['review'] } },
    phases: { review: { requireScopedAgent: true } },
    repos: ['example/app'],
  });
});

test('it replaces a part of the scope with an override', () => {
  expect(buildMockSpawnScope({ agents: {} }).agents).toStrictEqual({});
});
