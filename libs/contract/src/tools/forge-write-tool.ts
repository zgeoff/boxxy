import { makeTool } from './make-tool.ts';

// A tool that changes state and reads GitHub.
export const forgeWriteTool = makeTool({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
});
