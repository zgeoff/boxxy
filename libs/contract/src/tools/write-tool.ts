import { makeTool } from './make-tool.ts';

// A tool that changes state on each call.
export const writeTool = makeTool({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
});
