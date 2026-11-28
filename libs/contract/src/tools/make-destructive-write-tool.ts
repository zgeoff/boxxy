import { makeTool } from './make-tool.ts';

// A tool that removes or irreversibly closes something.
export const makeDestructiveWriteTool = makeTool({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
});
