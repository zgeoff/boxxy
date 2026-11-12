import { z } from 'zod';

// atc ids and names are short; the cap keeps a hostile answer from putting a large text in a row.
const text = z.string().min(1).max(512);
const time = z.number().int().nonnegative();

// The fields of atc's session entry that boxxy reads; atc sends more, and the parse drops them.
// The enums are closed: a value atc adds later fails the parse, so boxxy never guesses its meaning.
const sessionSchema = z.object({
  id: text,
  name: z.string().max(512),
  createdAt: time,
  state: z.enum(['running', 'needs_you', 'done', 'exited']),
  agentSessionID: text.optional(),
  lastAttachedAt: time,
  lifecycle: z.object({
    desired: z.enum(['run', 'sleep', 'stop']),
    harness: z.enum(['running', 'suspended', 'exited']),
  }),
  host: z
    .object({ name: z.string().max(512), id: text.optional(), issuer: text.optional() })
    .optional(),
});

// The structured result of each atc tool the adapter calls, by tool name.
export const atcToolResults = {
  atc_sessions_list: z.object({ sessions: z.array(sessionSchema).max(10_000) }),
  atc_session_get: z.object({ session: sessionSchema, lastActivityAt: time }),
  atc_session_spawn: sessionSchema,
  atc_session_stop: z.object({ stopped: z.boolean() }),
  atc_session_adopt: z.object({ adopted: z.boolean() }),

  // a target that destroys its hosts answers the first call with a token for a second call
  atc_session_forget: z.union([
    z.object({ confirmToken: text }),
    z.object({ forgotten: z.literal(true) }),
  ]),
  atc_message_send: z.object({ message: text, status: z.string().max(64) }),
} as const;
