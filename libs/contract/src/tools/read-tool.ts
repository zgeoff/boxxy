import { makeTool } from './make-tool.ts';

// A tool that changes nothing.
export const readTool = makeTool({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});
