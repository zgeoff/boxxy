import { brandSchemas } from '@boxxy/model';
import { z } from 'zod';

const itemID = z.string().transform((value) => brandSchemas.itemId.parse(value));
const attemptID = z.string().transform((value) => brandSchemas.attemptId.parse(value));

export const attemptSummarySchema = z.strictObject({
  id: z.string(),
  phase: z.string(),
  state: z.string(),
  outcome: z.string().nullable(),
});

export const sessionStartPayloadSchema = z.strictObject({
  session_id: z.string(),
  cwd: z.string(),
  hook_event_name: z.literal('SessionStart'),
  source: z.literal('startup'),
});

// one model request from the session of an attempt, `minute` minutes after the current item was set
const modelRequestSchema = z.strictObject({
  attempt: attemptID,
  minute: z.number().int().nonnegative(),
  costUSD: z.number(),
});

// The steps that only the harness can take, each with the schema of its body and of its answer. A
// route answers 400 to a body its schema refuses, and 409 to a step whose state is wrong.
export const controlRoutes = {
  health: {
    method: 'GET',
    path: '/control/health',
    request: z.null(),
    response: z.strictObject({ clock: z.string() }),
  },
  setCurrent: {
    method: 'POST',
    path: '/control/current',
    request: z.strictObject({ item: itemID }),
    response: z.null(),
  },
  readCurrent: {
    method: 'GET',
    path: '/control/current',
    request: z.null(),
    response: z.strictObject({ item: z.string() }),
  },

  // advances the clock by the queue wait, runs one tick, and answers the current item's new attempt
  startSession: {
    method: 'POST',
    path: '/control/sessions/start',
    request: z.strictObject({ queueMinutes: z.number().int().nonnegative() }),
    response: z.strictObject({
      attempt: z.string(),
      phase: z.string(),
      payload: sessionStartPayloadSchema,
    }),
  },
  advanceClock: {
    method: 'POST',
    path: '/control/clock',
    request: z.strictObject({ minutes: z.number().int().positive() }),
    response: z.strictObject({ clock: z.string() }),
  },
  endTurn: {
    method: 'POST',
    path: '/control/sessions/end-turn',
    request: z.strictObject({ attempt: attemptID }),
    response: attemptSummarySchema,
  },
  openPullRequest: {
    method: 'POST',
    path: '/control/pull-requests/open',
    request: z.null(),
    response: z.strictObject({ number: z.number().int() }),
  },
  mergePullRequest: {
    method: 'POST',
    path: '/control/pull-requests/merge',
    request: z.strictObject({
      number: z.number().int(),
      afterMinutes: z.number().int().nonnegative(),
    }),
    response: z.strictObject({ mergedAt: z.string() }),
  },
  sendTelemetry: {
    method: 'POST',
    path: '/control/telemetry',
    request: z.strictObject({ requests: z.array(modelRequestSchema) }),
    response: z.null(),
  },
  drainOutbox: {
    method: 'POST',
    path: '/control/outbox/drain',
    request: z.null(),
    response: z.strictObject({ sent: z.number().int() }),
  },
} as const;
