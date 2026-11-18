import type { SpawnScope } from '@boxxy/model';
import type { ServerConfig } from './server-config-schema.ts';

// The part of the `spawn` section that the rules loader reads.
export function toSpawnScope(spawn: ServerConfig['spawn']): SpawnScope {
  return { agents: spawn.agents, phases: spawn.phases, repos: Object.keys(spawn.repos) };
}
