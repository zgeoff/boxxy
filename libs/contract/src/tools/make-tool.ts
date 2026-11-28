import { oc } from '@orpc/contract';
import { mcp } from '@orpc/mcp';

// All four hints are required, so a tool cannot leave one out: a client treats a missing hint as
// the worst case, a write that deletes and reaches outside boxxy.
export interface ToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export function makeTool(annotations: ToolAnnotations) {
  return (name: string, description: string) =>
    oc.meta(mcp.tool({ name, description, annotations: { ...annotations } }));
}
