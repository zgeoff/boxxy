// Design sketch. It is not compiled.
//
// 01-api.ts: the boxxy API contract for v1. One contract-first oRPC v2 contract that the CLI, the
// oRPC route and the MCP endpoints all use.
//
//   A. The call sites: the server, the CLI, an MCP client.
//   B. Wire schemas and the rules of the contract.
//   C. The contract: 26 procedures in five groups.
//   D. Access: who calls each procedure, and which are MCP tools.
//   E. The session rule: how a call is tied to its attempt, and the bearer token of v1.
//   F. Imp identity, behind the `CallerProof` port.
//
// The package is `@boxxy/contract` (libs/contract/src/contract.ts, built: sections B to D are
// its code). The repo holds no server package yet: the build adds it. For v1 this contract is the list of
// procedures, in place of the type map `Procedures` and `procedurePolicy` of ../../03-commands.ts
// and of the table in docs/design/boxxy/slice-1.md, "Commands and API".
//
// Every row, state, command answer and fact type comes from the core (../core/02-types.ts and
// ../core/04-facts.ts). This file imports them by name and defines none of them again. A line
// that starts `core:` names the core shape a procedure uses.
// Packages: `@orpc/*` 2.0.0-beta.50, `@modelcontextprotocol/server` 2.4.0, zod 4.6.7. The oRPC
// and MCP calls of section A ran with these versions.

import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { oc } from '@orpc/contract';
import { McpRegistrar, mcp } from '@orpc/mcp';
import { COMMON_ERROR_STATUS_MAP, implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import * as z from 'zod';

// libs/model: the zod schema of each core type. `closeOutAnswerSchema` is core `CloseOutAnswer`;
// `limitFillSchema` is core `LimitFill`. `criterionInputSchema` and `itemDetailSchema` (the item
// view with its notes, attempts, relations, evidence and pull requests) live in
// libs/contract/src/contract.ts, because only the contract uses them.
import {
  attemptRowSchema,
  closeOutAnswerSchema,
  criterionInputSchema,
  itemDetailSchema,
  itemViewSchema,
  leverRowSchema,
  limitFillSchema,
  loadRejectionSchema,
  positionSchema, // the zod schema of core `Position`
} from '@boxxy/model';
import type { AttemptId, ClaimStore, Clock, LoadedRules, NewId, RunnerId } from '@boxxy/model';
import type { OutboxStatus, PepysReader } from './02-outbox.ts';
import { costToLandSchema, stageTimeSchema } from '@boxxy/model'; // libs/model/src/reports/

// ── A. The call sites ──────────────────────────────────────────────────────────────────────────

// A1. apps/server/src/serve-api.ts. One router, three doors.
interface ServerContext {
  readonly store: ClaimStore;
  readonly rules: () => LoadedRules;
  readonly pepys: PepysReader | null; // null: boxxy runs with no pepys
  readonly outbox: () => OutboxStatus;
  readonly runner: RunnerId;
  readonly clock: Clock;
  readonly newId: NewId;
}

declare const context: ServerContext;
declare const handlers: Parameters<ReturnType<typeof implementContract>['router']>[0];

const implementContract = () => implement(contract).$context<ServerContext>();
const router = implementContract().router(handlers); // handlers: apps/server/src/handlers/<group>.ts

// In oRPC v2 a typed error's HTTP status comes from `errorStatusMap`: a `status` in the
// contract's error has no effect. A code that is not in the map answers 400.
// Checked in the build: a custom code in `errorStatusMap` changes nothing on the MCP side. Over
// MCP a typed error is a tool error, and the HTTP status stays 200.
const rpc = new RPCHandler(router, { errorStatusMap: { ...COMMON_ERROR_STATUS_MAP, PEPYS_UNAVAILABLE: 503, PEPYS_NOT_CONFIGURED: 501, UNKNOWN_PHASE: 422 } });

// Two registrars, built once at start. The filter reads section D.
// Checked in the build: each endpoint's tool list holds only the tools the filter keeps.
const ownerTools = new McpRegistrar(router, { filter: (_procedure, path) => access[toName(path)].tool === 'owner' });
const sessionTools = new McpRegistrar(router, { filter: (_procedure, path) => access[toName(path)].tool === 'session' });

const serveTools = (registrar: McpRegistrar, name: string) =>
  createMcpHandler(async () => {
    const server = new McpServer({ name, version: '1.0.0' }); // one per request; the endpoint keeps no session
    await registrar.register(server, { context });

    return server;
  });

const ownerMcp = serveTools(ownerTools, 'boxxy');
const sessionMcp = serveTools(sessionTools, 'boxxy-session');

// Mounted on two Elysia apps, one per listener (Elysia 2 takes the options before the handler):
//   owner listener, `api.listen`, on the private network:
//   .get('/healthz', () => 'ok')
//   .all('/rpc/*',        { parse: 'none' }, ({ request }) => rpc.handle(request, { prefix: '/rpc', context }))
//   .all('/mcp',          { parse: 'none' }, ({ request }) => ownerMcp.fetch(request))     17 tools
//   worker listener, `api.workerListen`, the broker's target; 401 on any path with no token:
//   .all('/rpc/*',        { parse: 'none' }, ({ request }) => rpc.handle(request, { prefix: '/rpc', context }))
//   .all('/mcp/session',  { parse: 'none' }, ({ request }) => sessionMcp.fetch(request))    3 tools
// The build removes the slice 1 rule of docs/design/boxxy/slice-1.md that the server binds to
// `127.0.0.1` only.
// A worker session is in an imp and cannot reach the private network address. Its calls to
// `/rpc` and `/mcp/session` come through the impd broker, with a bearer token (section E).

// A2. apps/cli/src/create-client.ts. The CLI holds the typed client of the same contract.
// `BOXXY_URL` is the server's origin. The CLI reads no configuration file, and refuses to run without it.
// In a worker session `BOXXY_URL` is the made-up host of the broker
// (`https://boxxy.imp.example`), set by an atc auth profile. The CLI's HTTP client must work
// through `HTTPS_PROXY` over HTTP/1.1, because the broker ends the connection as HTTP/1.1. The
// CLI sends no token: the broker adds it.
// Not checked: Bun's fetch through `HTTPS_PROXY` with the broker's CA.
const client: RouterContractClient<typeof contract> = createORPCClient(new RPCLink({ origin: process.env.BOXXY_URL, url: '/rpc' }));
// Built: apps/cli/src/create-client.ts. `BoxxyClient` in `@boxxy/contract` is the client type. A test passes
// the server's listener as `fetch`; the real CLI passes none, so the platform's `fetch` and `HTTPS_PROXY` apply.

// One CLI command is one call. The command adds what a person or a session must not type:
//   boxxy defer i-12 --until 2026-12-01T09:00:00Z --reason "waits for the schema freeze to lift"
await client.plan.defer({ item: 'i-12', until: '2026-12-01T09:00:00Z', reason: 'waits for the schema freeze to lift' });

//   boxxy attempt close-out < close-out.json      (inside a session; no flag names the session)
// The CLI first asks `attempt.current`, which the server answers from the proven caller of the
// request, and sends that attempt's ID with the close-out (section E).
const current = await client.attempt.current({});

if (current.kind === 'attempt') {
  await client.attempt.closeOut({ session: { attempt: current.attempt.id }, closeOut: JSON.parse(await Bun.stdin.text()) });
} // a `refused` answer means the server has no attempt for the session yet: exit 2, try again in 5 seconds

// A3. An MCP client of the owner's agent: `tools/call` with name `item_file` and the same input
// object as `client.item.file`. The answer is the output as `structuredContent`; a typed error is
// a tool error whose text is `{"defined":true,"code":"NOT_FOUND",...}`.

// ── B. Wire schemas and the rules of the contract ──────────────────────────────────────────────
//
// 1. Names. A procedure is `<group>.<verb>`. Its MCP tool is `<group>_<verb>` in snake case, set
//    with `mcp.tool({ name })`, so a rename of a router key never renames a tool.
// 2. Descriptions. `mcp.tool({ description })` is the one text. The CLI's `--help` prints it too.
// 3. No transform in a contract schema. An ID is a plain string on the wire, and the handler
//    brands it.
//    Not checked: a zod transform in an MCP input schema.
// 4. Time. An input takes ISO 8601 with an offset, as the CLI flags do, because a model writes
//    it more reliably than epoch milliseconds. An output keeps the core rows, whose `Instant` is epoch
//    milliseconds.
// 5. Sizes. Every string and list has a `max`. The fact a command writes is thus bounded before
//    the store sees it (02-outbox.ts, section B). The route refuses a request body over 256 KiB.
// 6. Answers and errors. An answer that a caller acts on in its normal flow is a member of the
//    output union, with the core's `kind` (`rejected`, `refused`, `not-sleeping`). A call that
//    names a thing that does not exist, or that needs pepys when pepys does not answer, throws a
//    typed error. Input that fails its schema is oRPC's own `BAD_REQUEST` with the zod issues.
// 7. A command writes one `StoreChange`, with its facts, or nothing. A read writes nothing.
// 8. The server accepts the PREVIOUS version of the CLI. The `boxxy` CLI and the
//    hook plugin are in the agent image, and an image update can lag a server deploy. So a
//    release may add a procedure, an optional input field or an output field. It removes and
//    renames nothing that the previous CLI sends or reads, and makes no optional input required.
//    A breaking change takes two releases: first the server accepts both shapes.

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().min(1).max(max);
const time = z.iso.datetime({ offset: true });
const itemId = id.describe('The item ID, such as i-12.');
const reason = text(500).describe('Why, in one sentence. It is stored with the change.');

// core: `SessionRef`.
// No field of a session or hook call names a session: the server takes the session from the
// proven caller alone (section E). The attempt ID is no secret and proves nothing. It says
// which attempt the call is made for, so that a call made for an older attempt of a kept
// session is refused (`not-current`).
const sessionRef = z.object({
  attempt: id.describe('The ID of the attempt this call is for, as attempt_current gave it.'),
  agentSession: id.optional().describe("The agent's own session ID, when the caller knows it."),
  product: z.enum(['claude_code', 'codex']).optional(), // v1 workers are Claude; Codex as a worker is not in v1
});

const notFound = { NOT_FOUND: { message: 'no such item', data: z.object({ item: id }) } } as const;
const pepysErrors = {
  PEPYS_NOT_CONFIGURED: { message: 'this boxxy server has no pepys address' },
  PEPYS_UNAVAILABLE: { message: 'pepys did not answer', data: z.object({ reason: z.string() }) },
} as const;

const tool = (name: string, description: string) => oc.meta(mcp.tool({ name, description }));

// ── C. The contract ────────────────────────────────────────────────────────────────────────────

export const contract = {
  // ── C1. Item commands ──
  item: {
    // core: `item.file` with `kind` and `designMode`. Writes `boxxy.item.filed`, and one
    // `boxxy.relation.added` per `blockedBy`, in one change.
    file: tool('item_file', 'Files a new item of work. boxxy runs it through triage, design, build and review. Returns the item ID.')
      .errors({ NOT_FOUND: { message: 'a blockedBy item does not exist', data: z.object({ item: id }) } })
      .input(
        z.object({
          repo: text(200).describe('The repository, as owner/name.'),
          title: text(200),
          outcome: text(4000).describe('What is true when the item is done.'),
          acceptance: z.array(text(1000)).max(30).default([]).describe('One check per entry. Triage writes the list when it is empty.'),
          kind: id.optional().describe('The item kind. Triage sets it when absent.'),
          designMode: z.enum(['agent', 'attended']).optional().describe('attended: the owner works with the agent in the design session.'),
          blockedBy: z.array(itemId).max(20).default([]),
          labels: z.array(text(50)).max(20).default([]).describe('Free labels, such as "infra".'),
        }),
      )
      .output(z.object({ item: id })),

    // Writes `boxxy.item.edited`. The edit does not change a field that is absent.
    edit: tool('item_edit', 'Replaces the given fields of an item. A field that is left out does not change.')
      .errors(notFound)
      .input(
        z.object({
          item: itemId,
          title: text(200).optional(),
          outcome: text(4000).optional(),
          acceptance: z.array(criterionInputSchema).max(30).optional(),
          designMode: z.enum(['agent', 'attended']).optional(),
          labels: z.array(text(50)).max(20).optional().describe('The whole new list of labels.'),
        }),
      )
      .output(z.object({ item: id })),

    // Writes `boxxy.item.closed`.
    // The close also ends the item's live attempt, in the same change (core:
    // `endItemAttempts`). Without this, a sleeping attempt of a closed item stays live for ever.
    // A sleeping attempt settles at once as `failed`, `item-closed`, with no wake. Any other
    // live attempt moves to `closing`; the runner stops its session on the next tick and then
    // settles it the same way. The close itself deletes no session. Session cleanup
    // (../core/03-flow.ts, section H) forgets the stopped session 24 hours later, and the item's
    // kept session at once.
    // `item.close` is also the owner's confirm of a triage `declined` or `duplicate`. Such a
    // triage close-out holds the item (`position.kind` is `hold`, with the reason `declined` or
    // `duplicate`) and closes nothing by itself.
    close: tool('item_close', 'Closes an item so that boxxy starts no more work on it, and ends the attempt that runs or sleeps on it.')
      .errors(notFound)
      // `of` marks a duplicate. The same change adds the relation `duplicate-of` from this item
      // to `of`, and the stored reason is `duplicate`.
      .input(z.object({ item: itemId, reason, of: itemId.optional().describe('The item that this one duplicates.') }))
      .output(z.object({ item: id, ended: z.array(z.object({ attempt: id, how: z.enum(['settled', 'closing']) })) })),

    // core: `item.retry` with `phase`. Writes `boxxy.lever.recorded`.
    // With no `phase`, on an item that triage holds as `declined` or `duplicate`, it sends the
    // item back to triage.
    retry: tool('item_retry', 'Lifts a hold on an item and resets its attempt counts. With phase, also sends the item back to that phase.')
      .errors({ ...notFound, UNKNOWN_PHASE: { message: 'the pipeline of the item has no such phase' } })
      .input(z.object({ item: itemId, phase: id.optional().describe('triage, design, build or review.') }))
      .output(z.object({ lever: z.number().int() })),

    // core: `attempt.wake`, which takes an attempt or an item. The owner knows the item, so the
    // door is `item.wake` and it takes the item only. The runner calls `requestWake` directly.
    // Writes `boxxy.attempt.wake_requested`.
    wake: tool('item_wake', 'Asks boxxy to wake the sleeping session of an item. The session resumes when a seat is free. Returns the atc session to attach.')
      .errors(notFound)
      .input(z.object({ item: itemId }))
      .output(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('requested'), attempt: id, atcSession: id.nullable() }),
          z.object({ kind: z.literal('not-sleeping') }),
        ]),
      ),

    // ── C5. Reads (item) ──
    // `item.note` appends one note to an item. Notes are append-only; no procedure edits or
    // removes one. Writes `boxxy.item.noted` with the full text. The next attempt of the item
    // gets the notes with its input, from `attempt.current`. An owner tool: the owner's agent records an answer or a
    // decision here, and then calls `item.retry` when the item holds.
    note: tool('item_note', 'Appends a note to an item. A note cannot be changed or removed. The next attempt of the item reads every note.')
      .errors(notFound)
      .input(z.object({ item: itemId, text: text(8000) }))
      .output(z.object({ item: id, seq: z.number().int() })),

    // The answer also holds the item's labels and its notes, oldest first.
    get: tool('item_get', 'Returns one item with its position in the pipeline, its labels, notes, attempts, relations, evidence and pull requests.')
      .errors(notFound)
      .input(z.object({ item: itemId }))
      .output(itemDetailSchema),

    // 50 items per call at most, so one answer stays small for a model. `next` is the cursor.
    list: tool('item_list', 'Lists items with their derived state and position, newest first.')
      .input(
        z.object({
          state: z.enum(['idea', 'ready', 'blocked', 'running', 'waiting', 'done', 'archived']).optional(),
          repo: text(200).optional(),
          phase: id.optional().describe('Only items that stand at this phase.'),
          // a text query over the title, the outcome and the notes
          text: text(200).optional().describe('Only items whose title, outcome or notes hold this text.'),
          label: text(50).optional().describe('Only items with this label.'),
          limit: z.number().int().min(1).max(50).default(20),
          after: id.optional().describe('The `next` value of the call before.'),
        }),
      )
      // Each item comes with its labels and its relations (`itemViewSchema`, core `ItemView`),
      // so an agent can inspect the queue and find duplicates with this one tool.
      .output(z.object({ items: z.array(itemViewSchema), next: id.nullable() })),
  },

  // ── C2. Relation commands ──
  relation: {
    // Writes `boxxy.relation.added`. `refused` answers are normal flow, so they are in the output.
    add: tool('relation_add', 'Adds a relation from one item to another, such as "blocks". Refuses a relation that closes a cycle.')
      .errors(notFound)
      .input(z.object({ source: itemId, type: id.describe('The relation type: "blocks", "duplicate-of" or "relates-to".'), target: itemId }))
      .output(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('added') }),
          z.object({ kind: z.literal('refused'), reason: z.enum(['cycle', 'exists', 'unknown-type']) }),
        ]),
      ),

    // Writes `boxxy.relation.removed`.
    remove: tool('relation_remove', 'Removes a relation between two items.')
      .errors(notFound)
      .input(z.object({ source: itemId, type: id, target: itemId }))
      .output(z.object({ removed: z.boolean() })),
  },

  // ── C3. Attempt commands, for an agent in a session, and for the two hooks ──
  attempt: {
    // core: `attempt.current`, with one field more: `closeOut`. It tells the agent which of the
    // four close-outs its attempt takes: the phase, the JSON Schema of the body, and the outcome
    // names. So the agent reads the shape it must send from the server that will parse it.
    // It takes no input. The server finds the session from the proven caller and answers with
    // the LATEST attempt that the session carries. This is how every session, fresh or kept,
    // learns its attempt ID; nothing else carries it (no env value, no name, no prompt text).
    // It is a read, and it is the one session call with no attempt ID.
    current: tool('attempt_current', 'Returns the attempt that this session carries: its item, its phase, its input, and the schema of the close-out it must send.')
      .input(z.object({}))
      .output(
        z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('attempt'),
            attempt: attemptRowSchema,
            item: itemViewSchema,
            input: z.json(), // the phase kind's input, such as the findings for a build of round 2
            closeOut: z.object({
              phase: id,
              schema: z.json().describe('The JSON Schema of the close-out body of this phase.'),
              outcomes: z.array(z.string()),
            }),
            // `skills`: what the session-start hook fetches: the rules' pin and the names of the
            // attempt's recipe. `notes`: the item's notes, oldest first.
            skills: z.object({ pin: z.object({ source: z.string(), ref: z.string() }).nullable(), names: z.array(z.string()) }),
            notes: z.array(z.object({ seq: z.number().int(), text: z.string(), at: z.number() })),
          }),
          // `not-current` is in the union, as on the other session calls. The lookup of this
          // procedure never gives it, because the call names no attempt.
          z.object({ kind: z.literal('refused'), reason: z.enum(['no-attempt', 'not-current']) }),
        ]),
      ),

    // core: `attempt.closeOut` and `CloseOutAnswer`, as the core has them. ONE procedure takes
    // the close-out of every phase. The phase comes from the attempt row, and the body is parsed
    // by that phase kind's `closeOut` parser, which reports every problem at once. So `closeOut`
    // is `unknown` on the wire, and its four shapes are the core types below.
    //
    //   phase    body (core type)   outcomes                                      what it carries
    //   ───────  ─────────────────  ────────────────────────────────────────────  ──────────────────────────────────────────
    //   triage   TriageCloseOut     accepted, duplicate, declined                 the result; kind, designMode, acceptance; relations
    //   design   DesignCloseOut     designed, blocked, abandoned                  the design reference
    //   build    BuildCloseOut      built, blocked, abandoned                     evidence per criterion; open items
    //   review   ReviewCloseOut     passed, changes-requested                     the verdict; the findings
    //
    // Triage. `accepted` moves the item on. `declined` and `duplicate` do NOT close the item:
    // the rules map each to a hold, and the item waits for the owner. The hold withholds every
    // effect that changes an item (`close-item`, the relations, `set`); friction is recorded
    // all the same. `item.get` shows the agent's result, in the hold reason and in the
    // attempt's close-out: declined with its reason, or duplicate with the other item. The
    // owner confirms with `item.close`, or sends the item back to triage with `item.retry`. An
    // `accepted` close-out must leave the item with an acceptance list (`set.acceptance`, or
    // the item's own), or the parser answers `no-acceptance`.
    // Review. A review session in an imp runs `noslop review --report json` and sends this
    // close-out itself: `passed`, or `changes-requested` with the findings as text, plus
    // noslop's raw result (`noslop`), which the parser checks for shape only.
    //
    // Every body also carries `friction` and `frictionDropped`. The outcome names are those of
    // the core's phase files; this file fixes none of them. Writes `boxxy.attempt.closed_out`,
    // and the attempt moves to `closing`.
    closeOut: tool('attempt_close_out', 'Sends the close-out of the attempt that this session carries. The first valid close-out is final. A rejected answer lists every problem; fix them and send again.')
      .input(z.object({ session: sessionRef, closeOut: z.unknown().describe('The close-out body. Get its schema from attempt_current.') }))
      .output(closeOutAnswerSchema),

    // Writes `boxxy.evidence.recorded`. The fact ID is what a build close-out cites per criterion.
    evidence: tool('attempt_evidence', 'Records one piece of evidence for the attempt of this session: a test, a CI run or a live check. Returns the evidence ID to cite in the close-out.')
      .input(
        z.object({
          session: sessionRef,
          kind: z.enum(['test', 'ci-run', 'live-check']),
          ref: text(1000).describe('What was checked: a test file and name, a CI run URL, or the command of a live check.'),
          observed: text(2000).optional().describe('What was seen, such as "42 passed".'),
        }),
      )
      .output(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('recorded'), factId: id }),
          z.object({ kind: z.literal('refused'), reason: z.enum(['no-attempt', 'not-current']) }),
        ]),
      ),

    // core: `attempt.bindSession`. Called by `boxxy hook session-start`. Writes
    // `boxxy.attempt.session_bound` for a new pair. No tool: a hook program calls it, not a model.
    bindSession: oc
      // The hook. atc refuses `pluginDirs` on an imp, so the hook plugin and the
      // CLI are in the agent image, and the agent config names the plugin's path in the image.
      // `boxxy hook session-start` does, in order: `attempt.current`; fetch each named skill at
      // the pin into the session's workspace skills folder; this call. `missingSkills` names
      // each listed skill that is absent after the fetch; then the attempt settles as `failed`,
      // `skill-missing`, and the answer is `skill-missing`.
      .input(z.object({ session: sessionRef.required(), seenAt: time, missingSkills: z.array(text(100)).max(50).optional() }))
      .output(
        z.discriminatedUnion('kind', [
          // `not-current`: the call names an attempt that is not the latest one of the calling
          // session (core `findCallAttempt`).
          z.object({ kind: z.enum(['bound', 'held', 'no-attempt', 'not-current', 'skill-missing']) }),
          z.object({ kind: z.literal('fault'), fault: z.literal('agent-session-owned'), holder: id }),
        ]),
      ),

    // Called by `boxxy hook post-tool-use`. It reads the forge before it writes; `retry` means
    // the forge did not answer and the call wrote nothing (../core/04-facts.ts, section D).
    // Writes the pull request row, the evidence row and `boxxy.pull_request.linked` in one change.
    recordPullRequest: oc
      .input(z.object({ session: sessionRef, url: z.url().max(500) }))
      .output(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('linked'), repo: z.string(), number: z.number().int(), repeat: z.boolean() }),
          z.object({ kind: z.literal('retry') }),
          // `not-current` comes from core `findCallAttempt`.
          z.object({ kind: z.literal('refused'), reason: z.enum(['no-attempt', 'not-current', 'not-a-pull-request-url', 'linked-elsewhere']) }),
        ]),
      ),
  },

  // ── C4. Levers ──
  // Each writes one `boxxy.lever.recorded` per item. `item.retry` (C1) is a lever too.
  plan: {
    defer: tool('plan_defer', 'Holds an item back from dispatch until a time, or until plan_undefer.')
      .errors(notFound)
      .input(z.object({ item: itemId, until: time.optional(), reason }))
      .output(z.object({ lever: z.number().int() })),

    undefer: tool('plan_undefer', 'Ends the deferral of an item.')
      .errors(notFound)
      .input(z.object({ item: itemId }))
      .output(z.object({ lever: z.number().int() })),

    expedite: tool('plan_expedite', 'Puts items at the front of their pools, in the order given. It stops no running attempt.')
      .errors(notFound)
      .input(z.object({ items: z.array(itemId).min(1).max(20), reason, expires: time.optional() }))
      .output(z.object({ levers: z.array(z.number().int()) })),

    unexpedite: tool('plan_unexpedite', 'Ends the expedite of an item.')
      .errors(notFound)
      .input(z.object({ item: itemId }))
      .output(z.object({ lever: z.number().int() })),
  },

  // ── C5. Reads (the runner), and the three switches of the server itself ──
  runner: {
    status: tool('runner_status', 'Returns what boxxy does now: each limit and its seats, each live or sleeping attempt with its atc session, stray sessions, the paused flag, the rules version, and how far the fact outbox is behind.')
      .input(z.object({}))
      .output(
        z.object({
          paused: z.boolean(),
          limits: z.array(limitFillSchema), // core `LimitFill`
          attempts: z.array(
            z.object({
              attempt: attemptRowSchema, // every `LiveAttemptState`; `atcSession` is what the owner attaches
              title: z.string(),
              waitingSince: z.number().nullable(), // core `readWaitingSince`
            }),
          ),
          strays: z.array(attemptRowSchema), // core `listStrayAttempts`
          notices: z.object({ unsent: z.number().int() }), // hold notices that the notifier has not sent
          outbox: z.custom<OutboxStatus>(), // 02-outbox.ts, section E
          rules: z.object({ version: z.string(), commit: z.string(), lastRejected: z.object({ commit: z.string(), rejections: z.array(loadRejectionSchema) }).nullable() }),
        }),
      ),

    // ../core/04-facts.ts: these two write the `runners` row and no fact.
    pause: oc.input(z.object({})).output(z.object({ paused: z.literal(true) })),
    resume: oc.input(z.object({})).output(z.object({ paused: z.literal(false) })),
  },

  outbox: {
    // Clears the park mark of every parked outbox row, and wakes the sender (02-outbox.ts).
    retry: oc.input(z.object({})).output(z.object({ unparked: z.number().int() })),
  },

  // ── C5. Reads (rules) ──
  rules: {
    // The rules dry run. core: `rules.dryRun`, `RulesDryRun`, `dryRunRules`. The
    // server loads the given text with the phase kinds it runs, and answers, for each open item,
    // the position it has now and the position it would get. It writes nothing: no row, no fact,
    // and the rules the server runs do not change. A file that does not load is normal flow, so
    // `rejected` is in the output. No tool: owner, CLI only (section D).
    dryRun: oc
      .input(z.object({ rules: z.string().min(1).max(200_000).describe('The text of the rules file to try.') }))
      .output(
        z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('loaded'),
            version: z.string(),
            moved: z.number().int(), // how many of `items` have `moved: true`
            items: z.array(z.object({ item: id, now: positionSchema, then: positionSchema, moved: z.boolean() })),
          }),
          z.object({ kind: z.literal('rejected'), rejections: z.array(loadRejectionSchema) }),
        ]),
      ),
  },

  // ── C5. Reads (measures). Both read pepys, and only these two do (02-outbox.ts, section F) ──
  report: {
    // A procedure of the server: the CLI command `boxxy cost` calls it and does not call pepys.
    // So the owner's agent gets it as a tool, and the CLI holds no pepys address.
    // The output is the output of the query `boxxy_cost_to_land`, whole, plus `behind`.
    // `costToLandSchema` is declared once, in `@boxxy/model` (libs/model/src/reports/),
    // and the query in `@boxxy/pepys` uses the same schema as its `output`.
    //   lines   one per phase, rework flag, product, model and cost basis, with requests, four
    //            token counts and `costUSD` (null: not known, never 0). Rework is apart: a line
    //            with `rework: true` is an attempt of round 2 or later.
    //   totals   requests, costUSD, reworkCostUSD, requestsWithoutCost
    //   landedAt the earliest merge of a pull request the item produced, or null
    // `item` is boxxy's own item ID; the handler puts it back over the pepys entity ID.
    cost: tool('report_cost', 'Returns what one item cost: one line per phase, product and model, with rework apart, and totals. The numbers come from pepys and can be behind; `behind` says by how many facts. A cost of null is not known.')
      .errors({ ...notFound, ...pepysErrors })
      .input(z.object({ item: itemId }))
      .output(costToLandSchema.extend({ item: id, behind: behindSchema() })),

    // The output is the output of the query `boxxy_stage_time`, whole, plus `behind`. It holds
    // `sleepMinutes`, `environment` and `pullRequests`. The times, `endedAt` among them, are
    // ISO 8601 strings, as pepys stores them; the report passes them through.
    //   steps              always seven: triage, design, build, review, merge, release, deploy
    //   rework             { count, minutes }
    //   reviewWaitMinutes  null when no review followed a build
    //   sleepMinutes       the time the item's attempts slept
    //   environment        the one whose deploy counts: `pepys.environment` of the configuration
    stageTimes: tool('report_stage_times', 'Returns how long one item took in each of seven steps: triage, design, build, review, merge, release, deploy. Also the rework count and time, the wait for review, and the time its sessions slept. A step that has not happened is null.')
      .errors({ ...notFound, ...pepysErrors })
      .input(z.object({ item: itemId }))
      .output(stageTimeSchema.extend({ item: id, behind: behindSchema() })),
  },
};

// How many facts of this item the outbox has not sent yet. boxxy counts them in its own store,
// by the outbox `entity` column: every fact names its item (../core/04-facts.ts, section A, the
// entity rule).
function behindSchema() {
  return z.object({ facts: z.number().int(), oldestAt: z.number().nullable() });
}

// ── D. Access: who calls each procedure, and which are MCP tools ───────────────────────────────
//
// `caller` is who the procedure is for. The value picks the actor that the fact records.
// The root middleware checks it: a `session` or `hook` procedure needs the bearer token that
// the broker adds and a proven caller, and an `owner` procedure refuses the worker token
// (sections E and F).
// `tool` is the MCP endpoint that lists the procedure: `owner` is `/mcp`, `session` is
// `/mcp/session`, `none` is no endpoint.

type Caller = 'owner' | 'session' | 'hook';
interface Access {
  readonly caller: Caller;
  readonly actor: 'boxxy:owner:local' | 'boxxy:attempt:<id>' | 'boxxy:hook:<id>' | 'none';
  readonly tool: 'owner' | 'session' | 'none';
  readonly cli: string;
}

const ownerWrite = (cli: string): Access => ({ caller: 'owner', actor: 'boxxy:owner:local', tool: 'owner', cli });
const ownerRead = (cli: string): Access => ({ caller: 'owner', actor: 'none', tool: 'owner', cli });

export const access = {
  // The owner's agent files and steers work on the owner's behalf, so it gets every command on an
  // item and every read: 17 tools. One read is not among them, `rules.dryRun` (below), which is
  // CLI only.
  'item.file': ownerWrite('boxxy item file --repo --title --outcome [--acceptance]… [--kind] [--design-mode] [--blocked-by]… [--label]…'),
  'item.edit': ownerWrite('boxxy item edit <item> [--title] [--outcome] [--acceptance]… [--design-mode] [--label]…'),
  'item.close': ownerWrite('boxxy item close <item> --reason [--of]'),
  'item.retry': ownerWrite('boxxy item retry <item> [--phase]'),
  'item.wake': ownerWrite('boxxy item wake <item>'),
  'item.note': ownerWrite('boxxy item note <item> --text'),
  'relation.add': ownerWrite('boxxy relation add <source> <type> <target>'),
  'relation.remove': ownerWrite('boxxy relation remove <source> <type> <target>'),
  'plan.defer': ownerWrite('boxxy defer <item> [--until] --reason'),
  'plan.undefer': ownerWrite('boxxy undefer <item>'),
  'plan.expedite': ownerWrite('boxxy expedite <item>… --reason [--expires]'),
  'plan.unexpedite': ownerWrite('boxxy unexpedite <item>'),
  'item.get': ownerRead('boxxy item show <item>'),
  'item.list': ownerRead('boxxy item list [--state] [--repo] [--phase] [--text] [--label]'),
  'runner.status': ownerRead('boxxy status'),
  'report.cost': ownerRead('boxxy cost <item>'),
  'report.stageTimes': ownerRead('boxxy times <item>'),

  // An agent in a session needs three things: what it works on, a place for evidence, and the
  // close-out. Three tools, on their own endpoint, so a session's tool list stays short and holds
  // no command on another item. A session files found work in its close-out (`openItems`), not
  // with `item_file`, so settle can dedupe it.
  'attempt.current': { caller: 'session', actor: 'none', tool: 'session', cli: 'boxxy attempt current' },
  'attempt.evidence': { caller: 'session', actor: 'boxxy:attempt:<id>', tool: 'session', cli: 'boxxy attempt evidence --kind --ref [--observed]' },
  'attempt.closeOut': { caller: 'session', actor: 'boxxy:attempt:<id>', tool: 'session', cli: 'boxxy attempt close-out   (JSON on stdin)' },

  // Not tools: a hook program calls them with a hook payload. A model has no reason to.
  'attempt.bindSession': { caller: 'hook', actor: 'boxxy:hook:<id>', tool: 'none', cli: 'boxxy hook session-start   (hook payload on stdin)' },
  'attempt.recordPullRequest': { caller: 'hook', actor: 'boxxy:hook:<id>', tool: 'none', cli: 'boxxy hook post-tool-use   (hook payload on stdin)' },

  // Not tools: each one switches the server itself, not one item, and writes no fact that would
  // show who did it. They are for a person at the CLI.
  'runner.pause': { caller: 'owner', actor: 'none', tool: 'none', cli: 'boxxy runner pause' },
  'runner.resume': { caller: 'owner', actor: 'none', tool: 'none', cli: 'boxxy runner resume' },
  'outbox.retry': { caller: 'owner', actor: 'none', tool: 'none', cli: 'boxxy outbox retry' },

  // Not a tool, by choice: owner, CLI only. Its input is a whole rules file, and
  // the owner runs it at a rules change, before the merge. It writes nothing.
  'rules.dryRun': { caller: 'owner', actor: 'none', tool: 'none', cli: 'boxxy rules dry-run <file>' },
} as const satisfies Record<string, Access>;

declare function toName(path: readonly string[]): keyof typeof access; // ['item', 'file'] ─▶ 'item.file'

// Three tests keep this table and the rules of section E:
//   1. A test in `@boxxy/contract` walks `contract` and fails when a procedure has no `access`
//      entry, when an entry names no procedure, or when `tool` is not `none` and the procedure
//      has no `mcp.tool` name.
//   2. A test walks `contract` with the worker bearer token: for every procedure the answer is
//      `FORBIDDEN`, unless its `access.caller` is `session` or `hook`. It runs against `/rpc`
//      and against both MCP endpoints.
//   (Built: a fourth test, in apps/cli, walks `access` and fails when a procedure has no CLI command.)
//   3. A test walks every procedure whose `access.caller` is `session` or `hook`, with the
//      worker bearer token, and sends in turn: no `Imp-Identity`; a token with a wrong
//      audience; an expired token; a token of an issuer that is not configured; a token of an
//      imp that no attempt's session runs in; session A's token with session B's attempt ID;
//      and, for a kept session, the first attempt's ID after the second attempt started. Each
//      must leave every attempt row, the outbox and the `attempt_sessions` table as they were.
//      Then session A's token and A's attempt ID with B's atc session ID in an extra input
//      field: the field is ignored and only A's attempt changes. The cases run against a build
//      attempt and a review attempt. One more case: the owner's path (no bearer token) calls a
//      session procedure and is refused too, because it has no `Imp-Identity`.

// ── E. The session rule: a bearer token and a proven caller for sessions and hooks ─────────────
//
// Two paths reach the server:
//   the owner            The private network only: `/rpc` and `/mcp` through the private
//                        network's route. No token.
//   a session, a hook    A worker session runs in an imp. An imp reaches the public internet only,
//                        not the private network and not the cluster. Its calls go through the
//                        impd broker: the session calls a made-up host
//                        (`https://boxxy.imp.example`), the broker sends the request to the boxxy
//                        Service through a relay on the host, and ADDS the bearer token. The
//                        session never holds the token. It gets the address as `BOXXY_URL`, from
//                        the `env` of an atc auth profile.
//
// ┌─ SECURITY RULE: the scope of the worker token. ──────────────────────────────────────────────
// │ A request that arrives WITH the worker bearer token may call ONLY the procedures whose
// │ `access.caller` is `session` or `hook`. EVERY owner procedure refuses it with `FORBIDDEN`.
// │ A request on the owner's path (the private network, no token) may call every owner
// │ procedure. It can call no session or hook procedure: it has no `Imp-Identity` (rule 2).
// │ One root middleware, `implement(contract).use(...)`, does this from the `access` table; no
// │ handler repeats the check. So a session cannot send `item.close`, `item.retry` or
// │ `runner.pause` through the broker, although the broker carries any path.
// │ A wrong token is refused with 401, on every procedure.
// │ A session on a `local` target reaches the server on the private network with no token, as
// │ the owner does, and so may call every OWNER procedure. v1 accepts that, because the workers
// │ of v1 run on the `cloud` target. It can call no session or hook procedure: it has no
// │ `Imp-Identity`.
// └──────────────────────────────────────────────────────────────────────────────────────────────
//
// What v1 does:
//   1. The server checks the bearer token on every call of a procedure whose `access.caller` is
//      `session` or `hook`, and on `/mcp/session`. A call with no token, or with a wrong one, is
//      refused with 401. The check is one root middleware, `implement(contract).use(...)`, which
//      runs for `/rpc` and `/mcp` together. A procedure whose caller is `owner` needs no token:
//      the private network is its gate. With the token it answers `FORBIDDEN` (the rule above).
//      `/mcp` lists owner tools only, so the token gets `FORBIDDEN` there too.
//   2. The ownership rule. EVERY `session` and `hook` procedure, `attempt.bindSession`
//      included, REQUIRES a proven caller. No call names its own session: a session that could
//      send a session ID could send another session's ID and act on the other attempt. In the
//      root middleware, after the bearer token:
//        a. `callerProof.prove(request)` gives a `CallerIdentity { issuer, subject }` or null.
//           The middleware calls this PORT and never a verifier. null: 401, on every session
//           and hook procedure. The port and its three adapters are declared below.
//        b. `findSessionByCaller(caller)` in boxxy's OWN store: the atc session whose LATEST
//           attempt row holds that caller. The runner records the caller on the attempt row
//           from the worker's answer at `started` and at each reading; a claim that resumes a
//           kept session copies it from the kept session. null: `refused: no-attempt`. That
//           covers a caller that boxxy started nothing for, and an attempt whose worker gave
//           no caller. `ambiguous`: `FORBIDDEN`, and the server logs it.
//        c. The handler gives the core `CallRef { attempt, session, caller }`: `session` from
//           step b and `caller` from step a, NEVER from the request; `attempt` from
//           `SessionRef.attempt`. The core's `findCallAttempt` (../core/03-flow.ts, section D)
//           is the one check, inside the store's lock: `not-current` unless the attempt is the
//           latest one that the session carries, and `no-attempt` unless that attempt's OWN
//           `caller` equals the proven one. So session A's proof with session B's attempt ID
//           writes nothing. The check is on the attempt's own caller, and steps b and c look
//           at the LATEST attempt only: a match on any attempt row of the session would let
//           the first attempt of a kept session authorise a second attempt that holds no
//           caller.
//           `attempt.current` uses core `findCurrentAttempt`, with the same caller check.
//      No branch skips a step. A check that cannot be made is a refusal.
//
//      The port (the ports of `@boxxy/model`, declared at the end of this file) and its
//      adapters:
//        `impIdentityCallerProof({ issuers, audience, clock })`  v1. Reads the `Imp-Identity` header
//             and verifies the token with `verifyImpIdentity`: the trust documents, the
//             audience `boxxy.imp.example`, the life of 60 seconds (checked as 55 s plus 5 s
//             of leeway), the retire rules (section F). `issuer` is the token's `iss`; `subject` is its `sub`.
//        `createFakeCallerProof()`                        tests: a test sets who the next
//             request is from.
//        `noCallerProof`                                  always null. The server uses it when
//             its configuration has no `trustedIssuers` section, so every session and hook
//             call is refused.
//   3. How a session learns its attempt ID: `attempt.current`, which takes no input and
//      answers from step b alone (the latest attempt of the session). The CLI
//      calls it at the start of each command and sends the ID it got with the command's own
//      call. The hooks do the same. Nothing else carries the ID to a session, fresh or kept.
//      What this does and does not stop on a kept session: a REQUEST that was built for the
//      first attempt and arrives late carries the first ID, and is `not-current`. A COMMAND
//      that the agent runs late, with a body it wrote for the first attempt, asks
//      `attempt.current` anew and acts on the second attempt. Both attempts are the session's
//      own, so this is a fault of the agent and no breach of ownership; the phase kind's
//      parser still checks the body against the second attempt.
//   4. A write goes under the attempt's lease generation (`StoreChange.under`), so a call for an
//      attempt that settled is refused (`not-current`), and the first valid close-out is final
//      (`already-closed-out`): a later call cannot replace it.
//   5. When the call carries `agentSession`, the pair must not be bound to another attempt: the
//      core answers the fault `agent-session-owned`.
//
// The bearer token proves only that a call came through the broker. The caller's proof says
// who sent it, and rule 2 maps the caller to one session and to that session's current attempt.
// A review attempt is covered as every other attempt: the review session runs in its own imp.
//
// Assumed: two things that v1 depends on for this rule, and does not have yet, and one it has:
//   - the impz broker that strips and signs `Imp-Identity`, and `impz identity jwks`, which
//     gives the trust document. The verifier is published: `@impz/client` 6.12.0 (section F);
//   - built: atc 7.13.0 reports a session's imp ID and its host's issuer (`host: { name, id?,
//     issuer? }`), which is the caller identity of the session;
//   - the broker rule of `boxxy.imp.example` has `identity: true`, and the server's
//     configuration holds one trust document per impd host.
// Until the broker and the rule are in place, every session and hook call is refused.
//
// Sessions that share an imp: atc runs a sub-session in its parent's imp. boxxy starts no
// sub-session, so step b finds one session per imp. A sub-session that a worker starts itself
// calls as its parent's session; it is that worker's helper, and the imp is the boundary.
//
// The fact records the truth that boxxy has: the actor is `boxxy:attempt:<id>` of the attempt
// found by rule 2, and the server log holds the caller's issuer and subject of each attempt
// call.

// ── F. Imp identity, behind the `CallerProof` port ─────────────────────────────────────────────
//
// What the boxxy server does with the `Imp-Identity` token:
//   - The broker removes every `Imp-Identity` header that a guest sends, and adds one of its own:
//     a JWT that impd signs. ES256; the audience is the made-up host (`boxxy.imp.example`); it
//     is valid for 60 seconds; the subject is the imp ID; the issuer is the token's `iss`.
//   - The server verifies the token: the signature against impd's public keys from its
//     configuration (one trust document per impd host), the audience, and the time. It checks
//     the 60 seconds of life as 55 s plus 5 s of leeway.
//   - The adapter `impIdentityCallerProof` gives the token's issuer and subject as a
//     `CallerIdentity`. The server then finds the session FROM that caller (section E, rule
//     2). Never by imp name, and never by a session that the call names.
//   - The check is required from the first release. A session whose imp ID or issuer atc does
//     not give has no caller on its attempt row, and every call from it is refused.
//   - It is the second step of the same root middleware, after the bearer token. Because the
//     caller says which session calls, `SessionRef` holds `attempt` and no session ID, and
//     `attempt.current` takes no input.
//   - The verifier is not in this repo. impz builds it: the package `@impz/client`, entry
//     `@impz/client/identity`, exports `verifyImpIdentity`, `checkSessionImp` and
//     `loadIdentityIssuers` (one trust document per issuer). The adapter
//     `impIdentityCallerProof` imports from that entry. The format of a trust document and the
//     retire rules of a signing key are that package's. The adapter takes each trust document
//     as parsed JSON and checks it with `loadIdentityIssuers`, so no other package names its type.
//   - The configuration section `trustedIssuers { folders, audience }` holds the folders of the
//     trust documents and the audience. The server parses every file in those folders as JSON
//     and passes the values to the adapter.

// The port. One method. The root middleware knows no header and no token. `CallerIdentity` and
// `AtcSessionId` are core types (../core/02-types.ts).
export interface CallerProof {
  prove: (request: Request) => Promise<CallerIdentity | null>;
}
export declare function impIdentityCallerProof(options: { issuers: readonly unknown[]; audience: string; clock: Clock }): CallerProof;
// Built: adapters/caller-proof-imp (`@boxxy/caller-proof-imp`). `issuers` holds the trust
// documents as parsed JSON, so no package but the adapter names `IdentityTrustDocument`; the app
// reads the files of `trustedIssuers.folders`. The factory checks them with `loadIdentityIssuers`
// and throws on a bad document or two documents of one issuer, so the server does not start. With
// no document or an empty audience, `prove` answers null for every request. `prove` reads the
// header `imp-identity` (a compact JWT, no scheme), passes `clock.now()` in whole seconds, and
// maps `VerifiedImp` to `{ issuer: issuer, subject: id }`; the imp name is never the subject.
// `checkSessionImp` is not called: the server's `findSessionByCaller` and the core's attempt
// check compare issuer and subject already (v1-api-and-auth.md, "The proven caller").
export declare function createFakeCallerProof(): CallerProof & { setCaller: (caller: CallerIdentity | null) => void };
export declare const noCallerProof: CallerProof;

// The edge's lookup: the store's `findSessionByCaller`, as an answer.
export declare function findCallSession(input: { store: ClaimStore; caller: CallerIdentity }): Promise<{ kind: 'session'; session: AtcSessionId } | { kind: 'no-attempt' } | { kind: 'ambiguous' }>;
