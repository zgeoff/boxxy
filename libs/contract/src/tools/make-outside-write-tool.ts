import { makeTool } from './make-tool.ts';

// A tool that changes state and reads a system outside boxxy, such as GitHub.
export const makeOutsideWriteTool = makeTool({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
});
