import type { ProcedureName } from '@boxxy/contract';
import { access } from '@boxxy/contract';

// Every procedure that the owner calls, from the access table, one row each for `test.each`.
export function listOwnerProcedures(): [ProcedureName][] {
  return collectNames()
    .filter((name) => access[name].caller === 'owner')
    .map((name) => [name]);
}

// The MCP tool name of every procedure that `/mcp` lists.
export function listOwnerTools(): [string][] {
  return collectNames()
    .filter((name) => access[name].tool === 'owner')
    .map((name) => [toToolName(name)]);
}

// Every session and hook procedure.
export function listSessionProcedures(): [ProcedureName][] {
  return collectNames()
    .filter((name) => access[name].caller !== 'owner')
    .map((name) => [name]);
}

// The MCP tool name of every procedure that `/mcp/session` lists.
export function listSessionTools(): [string][] {
  return collectNames()
    .filter((name) => access[name].tool === 'session')
    .map((name) => [toToolName(name)]);
}

function collectNames(): ProcedureName[] {
  return Object.keys(access).filter((name): name is ProcedureName => Object.hasOwn(access, name));
}

function toToolName(name: string): string {
  return name.replace('.', '_').replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
