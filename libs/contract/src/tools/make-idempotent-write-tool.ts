import { makeTool } from './make-tool.ts';

// A tool that changes state once: a repeat with the same input changes nothing more.
export const makeIdempotentWriteTool = makeTool({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});
