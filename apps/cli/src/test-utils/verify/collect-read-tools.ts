import { access } from '@boxxy/contract';

// The public door's tools that a `read` token may call, by MCP tool name: each owner tool whose
// access row asks for the read scope. A read-only target calls only these.
export function collectReadTools(): string[] {
  return Object.entries(access)
    .filter(([, row]) => row.tool === 'owner' && row.scope === 'read')
    .map(([name]) => toToolName(name));
}

// `report.stageTimes` is the tool `report_stage_times`
function toToolName(name: string): string {
  return name.replace('.', '_').replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
