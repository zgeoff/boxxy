import type { GrantScope } from '@boxxy/contract';
import { access } from '@boxxy/contract';

const toolScopes: ReadonlyMap<string, GrantScope> = new Map(
  Object.entries(access).flatMap(([name, row]): [string, GrantScope][] =>
    row.tool === 'owner' && row.scope !== 'none' ? [[toToolName(name), row.scope]] : [],
  ),
);

// The scope a token needs to call an owner tool, by tool name. A tool with no scope listed is
// refused, so the public door registers only the tools this finds a scope for.
export function pickToolScope(toolName: string): GrantScope | null {
  return toolScopes.get(toolName) ?? null;
}

function toToolName(name: string): string {
  return name.replace('.', '_').replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
