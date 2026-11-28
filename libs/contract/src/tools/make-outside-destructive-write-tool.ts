import { makeTool } from './make-tool.ts';

// A tool that removes or irreversibly closes something and reads a system outside boxxy, such as GitHub.
export const makeOutsideDestructiveWriteTool = makeTool({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
});
