import { makeTool } from './make-tool.ts';

// A tool that changes nothing and reads a system outside boxxy, such as pepys.
export const makeOutsideReadTool = makeTool({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});
