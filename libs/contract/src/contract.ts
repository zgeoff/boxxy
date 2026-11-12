import {
  attemptRowSchema,
  closeOutAnswerSchema,
  costToLandSchema,
  evidenceRowSchema,
  itemViewSchema,
  limitFillSchema,
  loadRejectionSchema,
  noteRowSchema,
  positionSchema,
  pullRequestRowSchema,
  relationRowSchema,
  stageTimeSchema,
} from '@boxxy/model';
import { oc } from '@orpc/contract';
import { mcp } from '@orpc/mcp';
import { z } from 'zod';
import { authContract } from './auth-contract.ts';

// The wire rules are in section B of the API sketch: no transform in an input, times as ISO 8601,
// a maximum on every string and list, and a release that removes or renames nothing.

const id = z.string().min(1).max(64);
const itemId = id.describe('The item ID, such as i-12.');
const time = z.iso.datetime({ offset: true });

const reason = z
  .string()
  .min(1)
  .max(500)
  .describe('Why, in one sentence. It is stored with the change.');

const designMode = z.enum(['agent', 'attended']);
const instantOrNull = z.number().nullable();
const count = z.number().int();
const text50 = z.string().min(1).max(50);
const text100 = z.string().min(1).max(100);
const text200 = z.string().min(1).max(200);
const text1000 = z.string().min(1).max(1000);
const itemOutput = z.object({ item: id });
const leverOutput = z.object({ lever: count });
const itemInput = z.object({ item: itemId });
const emptyInput = z.object({});

// No field of a session or hook call names a session: the server takes the session from the
// proven caller. The attempt ID says which attempt the call is for, so that a call made for an
// older attempt of a kept session is refused.
const sessionRef = z.object({
  attempt: id.describe('The ID of the attempt this call is for, as attempt_current gave it.'),
  agentSession: id.optional().describe("The agent's own session ID, when the caller knows it."),
  product: z.enum(['claude_code', 'codex']).optional(),
});

const notFoundData = z.object({ item: id });
const notFound = { NOT_FOUND: { message: 'no such item', data: notFoundData } };
const pepysUnavailableData = z.object({ reason: z.string() });

const pepysErrors = {
  ...notFound,
  PEPYS_NOT_CONFIGURED: { message: 'this boxxy server has no pepys address' },
  PEPYS_UNAVAILABLE: { message: 'pepys did not answer', data: pepysUnavailableData },
};

// An entry that names the `id` of a criterion keeps that criterion's evidence; an entry with no
// `id` is a new criterion.
const criterionInput = z.object({
  id: id.optional().describe('The ID of an existing criterion to keep.'),
  text: text1000,
});

const itemDetail = z.object({
  item: itemViewSchema,
  notes: z.array(noteRowSchema),
  attempts: z.array(attemptRowSchema),
  relations: z.array(relationRowSchema),
  evidence: z.array(evidenceRowSchema),
  pullRequests: z.array(pullRequestRowSchema),
});

const outboxLastError = z.object({
  kind: z.enum(['retry', 'refused-batch', 'refused-sink']),
  status: count.nullable(),
  message: z.string(),
  at: z.number(),
});

const outboxStatus = z.object({
  sink: z.enum(['pepys', 'none']),
  state: z.enum(['idle', 'sending', 'backing-off', 'blocked', 'off']),
  unsent: count,
  parked: count,
  lag: instantOrNull,
  failingSince: instantOrNull,
  nextTryAt: instantOrNull,
  lastError: outboxLastError.nullable(),
  lastStoredAt: instantOrNull,
});

// How many facts of one item the outbox has not sent yet.
const behind = z.object({ facts: count, oldestAt: instantOrNull });

const attemptRefusal = z.object({
  kind: z.literal('refused'),
  reason: z.enum(['no-attempt', 'not-current']),
});

const itemFileInput = z.object({
  repo: text200.describe('The repository, as owner/name.'),
  title: text200,
  outcome: z.string().min(1).max(4000).describe('What is true when the item is done.'),
  acceptance: z
    .array(text1000)
    .max(30)
    .default([])
    .describe('One check per entry. Triage writes the list when it is empty.'),
  kind: id.optional().describe('The item kind. Triage sets it when absent.'),
  designMode: designMode
    .optional()
    .describe('attended: the owner works with the agent in the design session.'),
  blockedBy: z.array(itemId).max(20).default([]),
  labels: z.array(text50).max(20).default([]).describe('Free labels, such as "infra".'),
});

const itemEditInput = z.object({
  item: itemId,
  title: text200.optional(),
  outcome: z.string().min(1).max(4000).optional(),
  acceptance: z.array(criterionInput).max(30).optional(),
  designMode: designMode.optional(),
  labels: z.array(text50).max(20).optional().describe('The whole new list of labels.'),
});

const itemCloseInput = z.object({
  item: itemId,
  reason,
  of: itemId.optional().describe('The item that this one duplicates.'),
});

const endedAttempt = z.object({ attempt: id, how: z.enum(['settled', 'closing']) });
const itemCloseOutput = z.object({ item: id, ended: z.array(endedAttempt) });

const itemRetryInput = z.object({
  item: itemId,
  phase: id.optional().describe('triage, design, build or review.'),
});

const itemWakeOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('requested'), attempt: id, atcSession: id.nullable() }),
  z.object({ kind: z.literal('not-sleeping') }),
]);

const itemNoteInput = z.object({ item: itemId, text: z.string().min(1).max(8000) });
const itemNoteOutput = z.object({ item: id, seq: count });

const itemListInput = z.object({
  state: z.enum(['idea', 'ready', 'blocked', 'running', 'waiting', 'done', 'archived']).optional(),
  repo: text200.optional(),
  phase: id.optional().describe('Only items that stand at this phase.'),
  text: text200.optional().describe('Only items whose title, outcome or notes hold this text.'),
  label: text50.optional().describe('Only items with this label.'),
  limit: z.number().int().min(1).max(50).default(20),
  after: id.optional().describe('The `next` value of the call before.'),
});

const itemListOutput = z.object({ items: z.array(itemViewSchema), next: id.nullable() });

const relationAddInput = z.object({
  source: itemId,
  type: id.describe('The relation type: "blocks", "duplicate-of" or "relates-to".'),
  target: itemId,
});

const relationAddOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('added') }),
  z.object({ kind: z.literal('refused'), reason: z.enum(['cycle', 'exists', 'unknown-type']) }),
]);

const relationRemoveInput = z.object({ source: itemId, type: id, target: itemId });

const attemptSkills = z.object({
  pin: z.object({ source: z.string(), ref: z.string() }).nullable(),
  names: z.array(z.string()),
});

const attemptNote = z.object({ seq: count, text: z.string(), at: z.number() });

const attemptCloseOutShape = z.object({
  phase: id,
  schema: z.json().describe('The JSON Schema of the close-out body of this phase.'),
  outcomes: z.array(z.string()),
});

const attemptCurrentOutput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('attempt'),
    attempt: attemptRowSchema,
    item: itemViewSchema,
    input: z.json(),
    closeOut: attemptCloseOutShape,
    skills: attemptSkills,
    notes: z.array(attemptNote),
  }),
  attemptRefusal,
]);

const attemptCloseOutInput = z.object({
  session: sessionRef,
  closeOut: z.unknown().describe('The close-out body. Get its schema from attempt_current.'),
});

const attemptEvidenceInput = z.object({
  session: sessionRef,
  kind: z.enum(['test', 'ci-run', 'live-check']),
  ref: text1000.describe(
    'What was checked: a test file and name, a CI run URL, or the command of a live check.',
  ),
  observed: z.string().min(1).max(2000).optional().describe('What was seen, such as "42 passed".'),
});

const attemptEvidenceOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recorded'), factId: id }),
  attemptRefusal,
]);

const bindSessionInput = z.object({
  session: sessionRef.required(),
  seenAt: time,
  missingSkills: z.array(text100).max(50).optional(),
});

const bindSessionOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['bound', 'no-attempt', 'not-current', 'skill-missing']) }),
  z.object({ kind: z.literal('fault'), fault: z.literal('agent-session-owned'), holder: id }),
]);

const recordPullRequestInput = z.object({ session: sessionRef, url: z.url().max(500) });

const recordPullRequestOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('linked'), repo: z.string(), number: count, repeat: z.boolean() }),
  z.object({ kind: z.literal('retry') }),
  z.object({
    kind: z.literal('refused'),
    reason: z.enum(['no-attempt', 'not-current', 'not-a-pull-request-url', 'linked-elsewhere']),
  }),
]);

const deferInput = z.object({ item: itemId, until: time.optional(), reason });

const expediteInput = z.object({
  items: z.array(itemId).min(1).max(20),
  reason,
  expires: time.optional(),
});

const runnerAttempt = z.object({
  attempt: attemptRowSchema,
  title: z.string(),
  waitingSince: instantOrNull,
});

const rulesLastRejected = z.object({
  commit: z.string(),
  rejections: z.array(loadRejectionSchema),
});

const rulesStatus = z.object({
  version: z.string(),
  commit: z.string(),
  lastRejected: rulesLastRejected.nullable(),
});

const runnerStatusOutput = z.object({
  paused: z.boolean(),
  limits: z.array(limitFillSchema),
  attempts: z.array(runnerAttempt),
  strays: z.array(attemptRowSchema),

  // hold notices that the notifier has not sent; `lastError` is the reason of the most recent
  // try that was not sent
  notices: z.object({
    unsent: count,
    oldestUnsentAt: time.nullable(),
    lastError: z.string().nullable(),
  }),
  outbox: outboxStatus,
  rules: rulesStatus,
});

const dryRunInput = z.object({
  rules: z.string().min(1).max(200_000).describe('The text of the rules file to try.'),
});

const dryRunItem = z.object({
  item: id,
  now: positionSchema,

  // `then` is the wire name of the position the item would get
  // oxlint-disable-next-line unicorn/no-thenable -- a plain wire field, never awaited
  then: positionSchema,
  moved: z.boolean(),
});

const dryRunOutput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('loaded'),
    version: z.string(),
    moved: count,
    items: z.array(dryRunItem),
  }),
  z.object({ kind: z.literal('rejected'), rejections: z.array(loadRejectionSchema) }),
]);

const reportCostOutput = costToLandSchema.extend({ item: id, behind });
const reportStageTimesOutput = stageTimeSchema.extend({ item: id, behind });

export const contract = {
  item: {
    // Writes `boxxy.item.filed`, and one `boxxy.relation.added` per `blockedBy`.
    file: tool(
      'item_file',
      'Files a new item of work. boxxy runs it through triage, design, build and review. Returns the item ID.',
    )
      .errors({
        NOT_FOUND: { message: 'a blockedBy item does not exist', data: notFoundData },
        REPO_NOT_CONFIGURED: {
          message: 'the server configuration names no such repository',
          data: z.object({ repo: z.string() }),
        },
      })
      .input(itemFileInput)
      .output(itemOutput),

    // Writes `boxxy.item.edited`. The edit does not change a field that is absent.
    edit: tool(
      'item_edit',
      'Replaces the given fields of an item. A field that is left out does not change.',
    )
      .errors(notFound)
      .input(itemEditInput)
      .output(itemOutput),

    // Writes `boxxy.item.closed` and ends the item's live attempt in the same change. It is also
    // the owner's confirm of a triage `declined` or `duplicate`. With `of`, the same change adds
    // the relation `duplicate-of` from this item to `of`.
    close: tool(
      'item_close',
      'Closes an item so that boxxy starts no more work on it, and ends the attempt that runs or sleeps on it.',
    )
      .errors(notFound)
      .input(itemCloseInput)
      .output(itemCloseOutput),

    // Writes `boxxy.lever.recorded`. With no `phase`, on an item that triage holds as `declined`
    // or `duplicate`, it sends the item back to triage.
    retry: tool(
      'item_retry',
      'Lifts a hold on an item and resets its attempt counts. With phase, also sends the item back to that phase.',
    )
      .errors({
        ...notFound,
        UNKNOWN_PHASE: { message: 'the pipeline of the item has no such phase' },
      })
      .input(itemRetryInput)
      .output(leverOutput),

    // The owner knows the item, so this door takes the item only. Writes
    // `boxxy.attempt.wake_requested`.
    wake: tool(
      'item_wake',
      'Asks boxxy to wake the sleeping session of an item. The session resumes when a seat is free. Returns the atc session to attach.',
    )
      .errors(notFound)
      .input(itemInput)
      .output(itemWakeOutput),

    // Notes are append-only. Writes `boxxy.item.noted` with the full text.
    note: tool(
      'item_note',
      'Appends a note to an item. A note cannot be changed or removed. The next attempt of the item reads every note.',
    )
      .errors(notFound)
      .input(itemNoteInput)
      .output(itemNoteOutput),

    get: tool(
      'item_get',
      'Returns one item with its position in the pipeline, its labels, notes, attempts, relations, evidence and pull requests.',
    )
      .errors(notFound)
      .input(itemInput)
      .output(itemDetail),

    // 50 items per call at most, so one answer stays small for a model. `next` is the cursor.
    list: tool('item_list', 'Lists items with their derived state and position, newest first.')
      .input(itemListInput)
      .output(itemListOutput),
  },

  relation: {
    // Writes `boxxy.relation.added`. A `refused` answer is normal flow, so it is in the output.
    add: tool(
      'relation_add',
      'Adds a relation from one item to another, such as "blocks". Refuses a relation that closes a cycle.',
    )
      .errors(notFound)
      .input(relationAddInput)
      .output(relationAddOutput),

    // Writes `boxxy.relation.removed`.
    remove: tool('relation_remove', 'Removes a relation between two items.')
      .errors(notFound)
      .input(relationRemoveInput)
      .output(z.object({ removed: z.boolean() })),
  },

  attempt: {
    // It takes no input: the server finds the session from the proven caller and answers with
    // the latest attempt that the session carries. This is how every session learns its attempt
    // ID. `closeOut` tells the agent which of the four close-outs its attempt takes.
    current: tool(
      'attempt_current',
      'Returns the attempt that this session carries: its item, its phase, its input, and the schema of the close-out it must send.',
    )
      .input(emptyInput)
      .output(attemptCurrentOutput),

    // One procedure takes the close-out of every phase. The phase comes from the attempt row, and
    // that phase kind's parser reports every problem at once, so `closeOut` is `unknown` on the
    // wire. Writes `boxxy.attempt.closed_out`, and the attempt moves to `closing`.
    closeOut: tool(
      'attempt_close_out',
      'Sends the close-out of the attempt that this session carries. The first valid close-out is final. A rejected answer lists every problem; fix them and send again.',
    )
      .input(attemptCloseOutInput)
      .output(closeOutAnswerSchema),

    // Writes `boxxy.evidence.recorded`. The fact ID is what a build close-out cites per criterion.
    evidence: tool(
      'attempt_evidence',
      'Records one piece of evidence for the attempt of this session: a test, a CI run or a live check. Returns the evidence ID to cite in the close-out.',
    )
      .input(attemptEvidenceInput)
      .output(attemptEvidenceOutput),

    // A hook program calls it, as `boxxy hook session-start`, after it has fetched the skills.
    // `missingSkills` names each listed skill that is absent after the fetch.
    bindSession: oc.input(bindSessionInput).output(bindSessionOutput),

    // A hook program calls it, as `boxxy hook post-tool-use`. It reads the forge before it
    // writes; `retry` means the forge did not answer and the call wrote nothing.
    recordPullRequest: oc.input(recordPullRequestInput).output(recordPullRequestOutput),
  },

  // Each lever writes one `boxxy.lever.recorded` per item.
  plan: {
    defer: tool(
      'plan_defer',
      'Holds an item back from dispatch until a time, or until plan_undefer.',
    )
      .errors(notFound)
      .input(deferInput)
      .output(leverOutput),

    undefer: tool('plan_undefer', 'Ends the deferral of an item.')
      .errors(notFound)
      .input(itemInput)
      .output(leverOutput),

    expedite: tool(
      'plan_expedite',
      'Puts items at the front of their pools, in the order given. It stops no running attempt.',
    )
      .errors(notFound)
      .input(expediteInput)
      .output(z.object({ levers: z.array(count) })),

    unexpedite: tool('plan_unexpedite', 'Ends the expedite of an item.')
      .errors(notFound)
      .input(itemInput)
      .output(leverOutput),
  },

  runner: {
    status: tool(
      'runner_status',
      'Returns what boxxy does now: each limit and its seats, each live or sleeping attempt with its atc session, stray sessions, the paused flag, the rules version, and how far the fact outbox is behind.',
    )
      .input(emptyInput)
      .output(runnerStatusOutput),

    // These two write the runner row and no fact.
    pause: tool('runner_pause', 'Stops boxxy from claiming new work. Running attempts go on.')
      .input(emptyInput)
      .output(z.object({ paused: z.literal(true) })),
    resume: tool('runner_resume', 'Lets boxxy claim new work again.')
      .input(emptyInput)
      .output(z.object({ paused: z.literal(false) })),
  },

  outbox: {
    // Clears the park mark of every parked outbox row, and wakes the sender.
    retry: oc.input(emptyInput).output(z.object({ unparked: count })),
  },

  auth: authContract,

  rules: {
    // The server loads the given text with the phase kinds it runs, and answers, for each open
    // item, the position it has now and the position it would get. It writes nothing. A file that
    // does not load is normal flow, so `rejected` is in the output.
    dryRun: oc.input(dryRunInput).output(dryRunOutput),
  },

  // Both read pepys, and only these two do. `item` is boxxy's own item ID.
  report: {
    cost: tool(
      'report_cost',
      'Returns what one item cost: one line per phase, product and model, with rework apart, and totals. The numbers come from pepys and can be behind; `behind` says by how many facts. A cost of null is not known.',
    )
      .errors(pepysErrors)
      .input(itemInput)
      .output(reportCostOutput),

    stageTimes: tool(
      'report_stage_times',
      'Returns how long one item took in each of seven steps: triage, design, build, review, merge, release, deploy. Also the rework count and time, the wait for review, and the time its sessions slept. A step that has not happened is null.',
    )
      .errors(pepysErrors)
      .input(itemInput)
      .output(reportStageTimesOutput),
  },
};

function tool(name: string, description: string) {
  return oc.meta(mcp.tool({ name, description }));
}
