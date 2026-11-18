import type { SpawnScope } from '../rules/types.ts';

// A spawn scope with one review agent, and a review phase that needs it.
export function buildMockSpawnScope(overrides: Partial<SpawnScope> = {}): SpawnScope {
  return {
    agents: { 'claude-review': { phases: ['review'] } },
    phases: { review: { requireScopedAgent: true } },
    repos: ['example/app'],
    ...overrides,
  };
}
