import { makeTool } from './make-tool.ts';

// A tool that changes state on each call.
export const makeWriteTool = makeTool({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
});
