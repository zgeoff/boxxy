import { z } from 'zod';
import type { ServerConfig } from './server-config-schema.ts';
import { serverConfigSchema } from './server-config-schema.ts';

export type ConfigAnswer =
  | { readonly kind: 'read'; readonly config: ServerConfig }
  | { readonly kind: 'invalid'; readonly message: string };

// `spawn.reviewAgents` gave way to `spawn.agents`
const reviewAgentsMessage =
  'spawn.reviewAgents is no longer read. List each credentialed agent in spawn.agents, such as ' +
  '"agents": { "claude-review": { "phases": ["review"] } }, and set ' +
  '"phases": { "review": { "requireScopedAgent": true } } in spawn.';

// The configuration file, as JSON. A file that is missing, is no JSON, or fails the schema is
// `invalid`, with a message that names the file and the field.
export async function readServerConfig(path: string): Promise<ConfigAnswer> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return { kind: 'invalid', message: `no configuration file at ${path}` };
  }

  const text = await file.text();

  const json = parseJSON(text);

  if (json === undefined) {
    return { kind: 'invalid', message: `the configuration file at ${path} is not JSON` };
  }

  if (hasReviewAgents(json)) {
    return { kind: 'invalid', message: `${path}: ${reviewAgentsMessage}` };
  }

  const parsed = serverConfigSchema.safeParse(json);

  return parsed.success
    ? { kind: 'read', config: parsed.data }
    : { kind: 'invalid', message: `${path}: ${z.prettifyError(parsed.error)}` };
}

function parseJSON(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return undefined;
  }
}

function hasReviewAgents(json: unknown): boolean {
  const spawn = z
    .looseObject({ spawn: z.looseObject({ reviewAgents: z.unknown() }) })
    .safeParse(json);

  return spawn.success && Object.hasOwn(spawn.data.spawn, 'reviewAgents');
}
