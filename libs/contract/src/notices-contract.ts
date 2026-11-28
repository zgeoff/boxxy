import { z } from 'zod';
import { makeReadTool } from './tools/make-read-tool.ts';
import { makeWriteTool } from './tools/make-write-tool.ts';

// atc addresses a session only by its gateway ID, `<daemon>.<incarnation>.<id>`. The server checks
// the shape and never asks atc for the session: the notice token has no read scope.
const registerInput = z.object({
  gatewayID: z
    .string()
    .max(200)
    .regex(/^[^.\s]+\.[^.\s]+\.\S+$/u)
    .describe("The notice session's atc gateway ID, <daemon>.<incarnation>.<id>."),
});

const sessionOutput = z.object({
  // null: no notice session is registered
  session: z.object({ gatewayID: z.string(), setAt: z.iso.datetime({ offset: true }) }).nullable(),
});

// Both act on the one notice session row and write no fact.
export const noticesContract = {
  register: makeWriteTool(
    'notices_register',
    'Sets the session that gets each hold notice, by its atc gateway ID. A notice that waits goes to this session on its next try.',
  )
    .input(registerInput)
    .output(sessionOutput),

  show: makeReadTool(
    'notices_show',
    'Returns the session that gets each hold notice and when it was set. The session is null when none is registered.',
  )
    .input(z.object({}))
    .output(sessionOutput),
};
