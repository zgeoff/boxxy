// boxxy pepys package, file 1 of 4: the plug-in. Not compiled or type-checked.
// Every name of a person, a host, a repo and a model is invented.
//
//   A. The call sites: the cloud repo's deployment file, the boxxy server.
//   B. Where the fact types are declared, once (boxxy repo, libs/model).
//   C. The family and the source                  packages/pepys/src/source.ts
//   D. The link types and the consumer            packages/pepys/src/boxxy-work-consumer.ts
//   E. The plug-in                                packages/pepys/src/index.ts
//   F. The scriptc entry file                     packages/pepys/src/consumers/boxxy-work.ts
//   G. package.json
//
// Who owns what (this file defines none of it again):
//   the fact types, payloads and the entity rule     ../core/04-facts.ts
//   every `define*`, the glue, the wire, the host    `@pepys/kit` (the pepys repo)
//   the telemetry and GitHub tables                  `@pepys/source-telemetry`, `@pepys/source-github`
//   the sender, the reader port, the two reports     ../edge/02-outbox.ts, ../edge/01-api.ts

// ═════════════════════════════════════════════════════════════════════════════════════════════
// A. The call sites
// ═════════════════════════════════════════════════════════════════════════════════════════════

// A1. cloud repo, src/deployment.ts — the one thing the deployment file imports from the package.
import { defineDeployment } from '@pepys/kit';
import { githubPlugin } from '@pepys/source-github';
import { telemetryPlugin } from '@pepys/source-telemetry';
import { boxxyPlugin } from '@boxxy/pepys';

// The other two plug-ins must be listed: `boxxy_work` links to their kinds
// (`telemetry:session`, `github:pull_request`) and the two queries read their tables. Without
// them `checkDeployment` fails with `unknown-entity-kind` and `missing-consumer`.
export const deployment = defineDeployment({ name: 'harbour', plugins: [githubPlugin, telemetryPlugin, boxxyPlugin] });

// Ingest reads one more secret because of this plug-in: PEPYS_BOXXY_SIGNING_SECRET.
// `pepys build src/deployment.ts --out build/consumers` copies this package's `src` folder from
// node_modules, writes the glue with the cloud repo's own generator, and compiles
// `src/consumers/boxxy-work.ts` from the copy. So the package publishes `src` whole, and the
// entry file imports nothing outside `src`.

// A2. boxxy repo, apps/server/src/start-server.ts — the sender (../edge/02-outbox.ts, C1).
//   import { boxxySource } from '@boxxy/pepys/source';
//   createFactBatchSender({ source: boxxySource, url: config.pepys.ingestUrl, secret })
// The server imports the subpath `./source`, which loads the family and nothing of the GitHub or
// telemetry plug-ins. The root export loads all three.

// ═════════════════════════════════════════════════════════════════════════════════════════════
// B. The fact types are declared ONCE, in `@boxxy/model`
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// boxxy repo, libs/model/src/facts/fact-schemas.ts. The build changes this file: put `workFactSchemas`
// in the place of `factSchemas`, which the existing code declares for `SliceOneFacts`. One zod
// schema per type of `WorkFacts` (../core/04-facts.ts), checked against the type:
//
//   export const workFactSchemas = {
//     'boxxy.item.filed': itemRowSchema,
//     'boxxy.attempt.claimed': z.object({ attempt: brandSchemas.attemptId, phase: brandSchemas.phaseName, … }),
//     … 27 entries …
//   } satisfies { readonly [Type in FactType]: z.ZodType<WorkFacts[Type]> };
//
// Why `@boxxy/model` and not `@boxxy/pepys`: `applyChange` checks every fact before it writes
// the outbox row, and a lint rule keeps `@boxxy/pepys` out of `@boxxy/model`, `@boxxy/dispatch`
// and the other core packages (../edge/02-outbox.ts, section F). The dependency runs one way:
// `@boxxy/pepys` imports `@boxxy/model`.
//
// Who gets them, and how:
//   the store          `workFactSchemas[type].parse(payload)` in `applyChange`. No `storeVersion`.
//   the sender         `OutgoingFact<typeof boxxySource>`, the kit's type, from the family below.
//   ingest in pepys    the family's `types`: `receiveFactBatch` parses each payload against it.
//   the consumer       the GENERATED glue. `pepys build` reads the family's zod schemas and
//                      writes `src/generated/boxxy-work-boundary.ts`: one member of
//                      `BoxxyWorkFact` per type, and a decoder with no cast.
//
// Can the scriptc entry file use the schemas directly? No. It needs the generated glue:
//   - zod is run-time code outside the scriptc subset, and the profile fences it.
//   - a type import from `@boxxy/model` would compile in the boxxy repo and fail in the cloud
//     repo, where the build compiles a copy of this package's `src` alone.
// The glue is not a second declaration: it is written from the schemas, the package commits it,
// and `pepys build src/index.ts --check` in boxxy's CI fails when it is stale.

import { defineConsumer, defineFactFamily, defineLinkType, definePlugin, defineSource, defineTable, receiveFactBatch } from '@pepys/kit';
import { workFactSchemas } from '@boxxy/model';
import { z } from 'zod';
import { boxxyCostToLandQuery, boxxyStageTimeQuery } from './02-queries.ts';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// C. packages/pepys/src/source.ts
// ═════════════════════════════════════════════════════════════════════════════════════════════

// The sink adds `storeVersion` to every payload (../core/04-facts.ts, section A; `toWireItem` in
// ../edge/02-outbox.ts), and no catalog payload type holds it. A strict schema without the field
// would refuse every fact. So the family's schema is the model's schema plus that one field, and
// the model's schema holds no `storeVersion`.
// Assumed: every catalog payload is a zod object, so `extend` fits each of the 27.
type WithStoreVersion<Schemas extends Readonly<Record<string, z.ZodObject>>> = {
  readonly [Type in keyof Schemas]: z.ZodObject<Schemas[Type]['shape'] & { storeVersion: z.ZodNumber }>;
};

declare function addStoreVersion<const Schemas extends Readonly<Record<string, z.ZodObject>>>(schemas: Schemas): WithStoreVersion<Schemas>;

export const workFamily = defineFactFamily({
  stream: 'facts.boxxy.work',
  api: 'boxxy/1',
  // the entity rule of ../core/04-facts.ts: every fact names `boxxy:item:<item ID>`
  entityKind: 'boxxy:item',
  types: addStoreVersion(workFactSchemas),
});

export const boxxySource = defineSource({
  name: 'boxxy',
  families: [workFamily],
  live: receiveFactBatch({
    route: '/boxxy/facts',
    check: { kind: 'hmac-sha256', header: 'x-boxxy-signature-256', secretEnv: 'PEPYS_BOXXY_SIGNING_SECRET' },
    // factLimit 100 and bodyByteLimit 1 MiB are the kit's defaults. The sender's budget (100
    // facts, 900,000 bytes; ../edge/02-outbox.ts) is inside both.
    // `reach` is 'private'.
  }),
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// D. packages/pepys/src/boxxy-work-consumer.ts
// ═════════════════════════════════════════════════════════════════════════════════════════════

// The exact ID of each end:
//
//   ran_in     boxxy:attempt:<attempt ID>  ─▶  telemetry:session:<atc session ID>
//              (or `telemetry:session:<agent session ID>` for the fallback row; see the table below)
//   produced   boxxy:attempt:<attempt ID>  ─▶  github:pull_request:<GitHub's `id` of the pull request>
//   attempt_of boxxy:attempt:<attempt ID>  ─▶  boxxy:item:<item ID>
//
// Why both sides of a link hold the same ID:
//   ran_in     boxxy has the atc session ID from the spawn answer, and writes it as `atcSession`
//              of `.started`, `.reconciled` and `.resumed`. atc sets the resource attribute
//              `atc.session.id` to that ID on every telemetry record of the session, and the
//              telemetry plug-in's session entity is `telemetry:session:<value of atc.session.id>`
//              (lookups.md, lookup 2). `telemetry_model_request.session_id` is a copy of that entity.
//              A record with no `atc.session.id` gets the agent's own session ID as its session.
//              boxxy holds that ID in `session_bound.agentSession`: the fallback row.
//   produced   boxxy writes `pullRequestId`, a decimal string, from GitHub's `id` of
//              `GET /repos/{owner}/{repo}/pulls/{number}` (../core/04-facts.ts, section D). The
//              GitHub plug-in builds its entity ID from the webhook's `pull_request.id`
//              (lookups.md, lookups 1 and 3).
// Not checked: that a webhook's `pull_request.id` equals the REST `id`. Lookup 1 compared the
// REST `id` with the Events API payload, not with a webhook delivery.
// Assumed: an agent session ID never equals the atc session ID of another session.
export const ranIn = defineLinkType({ name: 'ran_in', from: ['boxxy:attempt'], to: ['telemetry:session'], hub: false });
export const produced = defineLinkType({ name: 'produced', from: ['boxxy:attempt'], to: ['github:pull_request'], hub: false });
// The third link type of the catalog (../core/04-facts.ts, section D). Without this one,
// `neighbourhood` from an item returns the item alone.
export const attemptOf = defineLinkType({ name: 'attempt_of', from: ['boxxy:attempt'], to: ['boxxy:item'], hub: false });

export const boxxyWorkConsumer = defineConsumer({
  name: 'boxxy_work',
  entry: new URL('./consumers/boxxy-work.ts', import.meta.url),
  // One scope per item. A fact on the stream marks its item's scope dirty; the module then gets
  // every fact of the item and returns every row and link the item owns.
  input: { mode: 'scope', scopeKind: 'boxxy:item', streams: [workFamily.stream] },
  tables: {
    // from: item.filed, item.edited, item.closed
    // The table has no `landed_at` column: no catalog fact says an item landed. "Landed" is
    // read from GitHub when a query runs (02-queries.ts, section C).
    boxxy_item: defineTable({
      columns: {
        id: { kind: 'entityID' }, // `boxxy:item:<item ID>`
        kind: { kind: 'text' },
        repo: { kind: 'text' },
        title: { kind: 'text' },
        design_mode: { kind: 'text', nullable: true }, // 'agent' | 'attended'; null: the item sets none
        filed_at: { kind: 'timestamp' },
        closed_at: { kind: 'timestamp', nullable: true },
        close_reason: { kind: 'text', nullable: true },
        updated_at: { kind: 'timestamp' },
      },
      primaryKey: ['id'],
      indexes: [],
    }),

    // from: attempt.claimed, .started, .reconciled, .resumed, .closed_out, .slept, .woken, .settled
    boxxy_attempt: defineTable({
      columns: {
        id: { kind: 'entityID' }, // `boxxy:attempt:<attempt ID>`
        item_id: { kind: 'entityID' },
        phase: { kind: 'text' }, // triage | design | build | review
        number: { kind: 'integer' }, // 1, 2, 3… over the item's attempts
        round: { kind: 'integer' }, // the item's round; an attempt with round > 1 is rework
        mode: { kind: 'text' }, // 'agent' | 'attended'
        pool: { kind: 'text' },
        recipe_hash: { kind: 'text' },
        rules_version: { kind: 'text' },
        // the bare atc session ID, for a person who reads the row; no query joins on it
        atc_session: { kind: 'text', nullable: true },
        state: { kind: 'text' }, // 'live' | 'succeeded' | 'failed'
        // A name of the phase kind's list, or one of the engine's two: `lost` (the
        // session was lost, timed out, or its item was closed) and `unsettleable` (boxxy could not
        // read the close-out). No phase kind may list either, so neither can equal a name that a
        // query tests for.
        outcome: { kind: 'text', nullable: true },
        // `closeout-missing`, `timed-out`, `item-closed`, `closeout-unsettleable`, …, or the close-out's reason
        failure: { kind: 'text', nullable: true },
        claimed_at: { kind: 'timestamp' },
        started_at: { kind: 'timestamp', nullable: true },
        closed_out_at: { kind: 'timestamp', nullable: true },
        ended_at: { kind: 'timestamp', nullable: true },
        // The stretches of sleep: a list of { from, to }, `to` null while asleep. The table has no
        // column of slept milliseconds: the module does no date arithmetic, so it stores the
        // stretches and the query adds them up.
        // Not checked: which `Date` functions scriptc fences. `Date.now` is the only one known
        // to be fenced.
        sleeps: { kind: 'json' },
        updated_at: { kind: 'timestamp' },
      },
      primaryKey: ['id'],
      indexes: [{ columns: ['item_id'] }],
    }),

    // One row per (attempt, telemetry session). THE join table of the cost query.
    // The primary key is (attempt_id, session_id), and the cost query joins through this table,
    // never on `boxxy_attempt.atc_session`: a join on that column alone cannot find a telemetry
    // row with no atc session ID, and it cannot split a session that served several attempts.
    // `key` says which ID the session entity holds:
    //   key 'atc'   session_id = `telemetry:session:<atc session ID>`. From .started, .reconciled,
    //                .resumed and .session_bound. One row per atc session of the attempt.
    //   key 'agent'  session_id = `telemetry:session:<agent session ID>`. From .session_bound.
    //                It matches only a telemetry row that carried no `atc.session.id`.
    // A telemetry row has one `session_id`, so it matches one of the two keys, never both. So no
    // attempt is dropped for a missing agent session, and a `/clear` (a second agent session in
    // one atc session) counts nothing twice.
    boxxy_attempt_session: defineTable({
      columns: {
        attempt_id: { kind: 'entityID' },
        session_id: { kind: 'entityID' },
        key: { kind: 'text' }, // 'atc' | 'agent'
        product: { kind: 'text', nullable: true }, // from .session_bound; null on an 'atc' row
        // The caller of the attempt, from `caller` of the attempt's `.started`, `.reconciled` or
        // `.resumed` fact (the latest one); the 'agent' rows of an attempt hold the same values.
        // null: boxxy recorded no caller, and then no telemetry counts for the attempt.
        caller_issuer: { kind: 'text', nullable: true },
        caller_subject: { kind: 'text', nullable: true },
        // the `at` of the earliest fact that names the pair: when the session became this attempt's
        bound_at: { kind: 'timestamp' },
      },
      primaryKey: ['attempt_id', 'session_id'],
      indexes: [{ columns: ['session_id'] }],
    }),
  },
  entityViews: [
    { table: 'boxxy_item', kind: 'boxxy:item', id: 'id', title: 'title', url: null, actor: null, updatedAt: 'updated_at' },
    { table: 'boxxy_attempt', kind: 'boxxy:attempt', id: 'id', title: 'phase', url: null, actor: null, updatedAt: 'updated_at' },
  ],
  reads: [], // scope mode
  links: [ranIn, produced, attemptOf],
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// E. packages/pepys/src/index.ts
// ═════════════════════════════════════════════════════════════════════════════════════════════

export const boxxyPlugin = definePlugin({
  name: 'boxxy',
  sources: [boxxySource],
  consumers: [boxxyWorkConsumer],
  queries: [boxxyCostToLandQuery, boxxyStageTimeQuery],
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// F. packages/pepys/src/consumers/boxxy-work.ts — the scriptc entry file
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// It imports the generated glue only: no zod, no `@boxxy/model`, no file outside `src`.
// It reads 13 of the 27 fact types and passes over the rest (`boxxy.item.noted` is one it passes
// over). It calls no `Date` function.
// Constructs: only those that scriptc compiles (a union narrowed on `type`, `for...of` over a
// typed array, index loops, object spread, typed link constructors). It uses no `Map`.

import {
  linkAttemptOf,
  linkProduced,
  linkRanIn,
  readScopeFacts,
  toBoxxyAttemptID, // 'a…' ─▶ `boxxy:attempt:a…`
  toBoxxyItemID, // takes the scope, which is the full ID
  toGithubPullRequestID, // '9001' (decimal text) ─▶ `github:pull_request:9001`
  toTelemetrySessionID, // 's…' ─▶ `telemetry:session:s…`
} from '../generated/boxxy-work-boundary.ts';
// Import only the types the file uses: an unused type import is a compile error.
import type { BoxxyAttemptID, BoxxyAttemptRow, BoxxyItemRow, BoxxyWorkOperation, TelemetrySessionID } from '../generated/boxxy-work-boundary.ts';

// The model contract. scriptc needs these four exports: the types `BoxxyWorkModel` and
// `BoxxyWorkMessage`, and the functions `init` and `update`. Without them it stops with
// `SC4009: contract sidecar: 'BoxxyWorkModel' is not an exported type declaration`.
// scriptc compiles this shape, and the compiled module runs.
export interface BoxxyWorkModel {
  operationsJSON: string;
}

export type BoxxyWorkMessage = { kind: 'apply'; scope: string } | { kind: 'reset' };

export function init(): BoxxyWorkModel {
  return { operationsJSON: '[]' };
}

export function update(model: BoxxyWorkModel, message: BoxxyWorkMessage): BoxxyWorkModel {
  return message.kind === 'reset' ? init() : { ...model, operationsJSON: applyScope(message.scope) };
}

// An edit that sorts before the `filed` fact. `mergeEdit` lays a later edit over an earlier one.
// It is a helper with a named type, because an assignment that reads `edit?.title` inside its own
// right-hand side is a TypeScript error (`Property 'title' does not exist on type 'never'`).
interface ItemEdit {
  title: string | undefined;
  kind: string | undefined;
  designMode: string | undefined;
  at: string;
}

function mergeEdit(earlier: ItemEdit | undefined, later: ItemEdit): ItemEdit {
  if (earlier === undefined) {
    return later;
  }

  return { title: later.title ?? earlier.title, kind: later.kind ?? earlier.kind, designMode: later.designMode ?? earlier.designMode, at: later.at };
}

// what the module gathers for one attempt before it writes a row
interface AttemptDraft {
  id: BoxxyAttemptID;
  row: BoxxyAttemptRow | undefined; // set by `claimed`; no `claimed`, no row
  claimedFact: string; // the ID of the `claimed` fact: the evidence of `attempt_of`
  atcSession: string | null;
  startedAt: string | null;
  closedOutAt: string | null;
  settled: { state: string; outcome: string; failure: string | null; at: string; asleep: boolean } | undefined;
  sleptAt: string[];
  wokenAt: string[];
  sessions: { session: TelemetrySessionID; key: 'atc' | 'agent'; product: string | null; at: string; evidence: string }[];
  // `id` is a string, the decimal text of the fact's `pullRequestId`: the glue's
  // `toGithubPullRequestID` takes a string, and a number does not compile against it. `at` is for
  // the tie rule of `hasPullRequest`.
  pullRequests: { id: string; at: string; evidence: string }[];
  updatedAt: string;
}

// The host calls this with one item's ID each time a fact of that item arrives. The result is
// the whole set of rows and links the item owns; what it leaves out, the host removes.
export function applyScope(scope: string): string {
  const item = toBoxxyItemID(scope);
  const drafts: AttemptDraft[] = [];
  let row: BoxxyItemRow | undefined = undefined;
  // an edit or a close that sorts before the `filed` fact is kept and laid over the row at the end
  let edit: ItemEdit | undefined = undefined;
  let closed: { at: string; reason: string } | undefined = undefined;

  // Every fact of the item, one per fact ID, sorted by `at`, then stream, then sequence. The
  // module does not rest on the order of two facts with one `at`: each rule below is "the
  // earliest", "the latest" or a pairing by time.
  for (const fact of readScopeFacts(item)) {
    if (fact.type === 'boxxy.item.filed') {
      const payload = fact.payload;

      row = { id: item, kind: payload.kind, repo: payload.repo, title: payload.title, design_mode: payload.fields.designMode ?? null, filed_at: fact.at, closed_at: null, close_reason: null, updated_at: fact.at };
    }

    if (fact.type === 'boxxy.item.edited') {
      edit = mergeEdit(edit, { title: fact.payload.title, kind: fact.payload.kind, designMode: fact.payload.fields?.designMode, at: fact.at });
    }

    if (fact.type === 'boxxy.item.closed') {
      closed = { at: fact.at, reason: fact.payload.reason };
    }

    if (fact.type === 'boxxy.attempt.claimed') {
      const draft = findDraft(drafts, toBoxxyAttemptID(fact.payload.attempt), fact.at);
      const payload = fact.payload;

      draft.claimedFact = fact.id;
      draft.row = {
        id: draft.id, item_id: item, phase: payload.phase, number: payload.number, round: payload.round, mode: payload.mode, pool: payload.pool,
        recipe_hash: payload.recipeHash, rules_version: payload.rulesVersion,
        atc_session: null, state: 'live', outcome: null, failure: null,
        claimed_at: fact.at, started_at: null, closed_out_at: null, ended_at: null, sleeps: [], updated_at: fact.at,
      };
    }

    // The three facts that carry the atc session ID of the attempt's session. A wake keeps the
    // session, so `resumed` adds no row unless the worker answered with a new ID.
    if (fact.type === 'boxxy.attempt.started' || fact.type === 'boxxy.attempt.reconciled' || fact.type === 'boxxy.attempt.resumed') {
      const draft = findDraft(drafts, toBoxxyAttemptID(fact.payload.attempt), fact.at);

      if (fact.type !== 'boxxy.attempt.resumed' && draft.startedAt === null) {
        draft.startedAt = fact.at;
        draft.atcSession = fact.payload.atcSession;
      }

      bindSession(draft, toTelemetrySessionID(fact.payload.atcSession), 'atc', null, fact.at, fact.id);
    }

    if (fact.type === 'boxxy.attempt.session_bound') {
      const draft = findDraft(drafts, toBoxxyAttemptID(fact.payload.attempt), fact.at);

      // the atc row too: `started` may be a parked outbox row that arrives later, or never
      bindSession(draft, toTelemetrySessionID(fact.payload.atcSession), 'atc', null, fact.at, fact.id);
      bindSession(draft, toTelemetrySessionID(fact.payload.agentSession), 'agent', fact.payload.product, fact.at, fact.id);
    }

    // One fact for every sleep. An idle sleep, a quiet sleep and the unattended sleep
    // (`sleep-unattended`) all write `slept`, and the payload names no cause.
    if (fact.type === 'boxxy.attempt.slept') {
      findDraft(drafts, toBoxxyAttemptID(fact.payload.attempt), fact.at).sleptAt.push(fact.at);
    }

    if (fact.type === 'boxxy.attempt.woken') {
      findDraft(drafts, toBoxxyAttemptID(fact.payload.attempt), fact.at).wokenAt.push(fact.at);
    }

    if (fact.type === 'boxxy.attempt.closed_out') {
      findDraft(drafts, toBoxxyAttemptID(fact.payload.attempt), fact.at).closedOutAt = fact.at;
    }

    if (fact.type === 'boxxy.attempt.settled') {
      const payload = fact.payload;

      // `at` equals `endedAt` (the catalog), so the module needs no number-to-date step.
      // `returnedOutcome` is not read: no table holds it, and `failure` already says
      // `closeout-unsettleable`.
      // An attempt that `item.close` ended while asleep has `asleep: true`, so its last stretch
      // of sleep ends at this fact.
      findDraft(drafts, toBoxxyAttemptID(payload.attempt), fact.at).settled = { state: payload.state, outcome: payload.outcome, failure: payload.failure, at: fact.at, asleep: payload.asleep };
    }

    if (fact.type === 'boxxy.pull_request.linked') {
      const draft = findDraft(drafts, toBoxxyAttemptID(fact.payload.attempt), fact.at);

      // the hook and the watch may both link one pull request: one link, the earliest evidence
      if (!hasPullRequest(draft, fact.payload.pullRequestId, fact.at, fact.id)) {
        draft.pullRequests.push({ id: fact.payload.pullRequestId, at: fact.at, evidence: fact.id });
      }
    }
  }

  const operations: BoxxyWorkOperation[] = [];

  for (const draft of drafts) {
    // An attempt with no `claimed` fact in the scope (the row is parked in boxxy's outbox, or not
    // sent yet) yields NOTHING: no row, no session row, no link. The fact marks the scope dirty
    // when it arrives, and the next run writes all of them.
    if (draft.row === undefined) {
      continue;
    }

    operations.push({
      upsert: {
        boxxy_attempt: {
          ...draft.row,
          atc_session: draft.atcSession,
          started_at: draft.startedAt,
          closed_out_at: draft.closedOutAt,
          state: draft.settled === undefined ? 'live' : draft.settled.state,
          outcome: draft.settled === undefined ? null : draft.settled.outcome,
          failure: draft.settled === undefined ? null : draft.settled.failure,
          ended_at: draft.settled === undefined ? null : draft.settled.at,
          sleeps: pairSleeps(draft),
          updated_at: draft.updatedAt,
        },
      },
    });
    operations.push(linkAttemptOf({ from: draft.id, to: item, confidence: 1, evidence: draft.claimedFact }));

    for (const bound of draft.sessions) {
      operations.push({ upsert: { boxxy_attempt_session: { attempt_id: draft.id, session_id: bound.session, key: bound.key, product: bound.product, bound_at: bound.at } } });
      operations.push(linkRanIn({ from: draft.id, to: bound.session, confidence: 1, evidence: bound.evidence }));
    }

    for (const pullRequest of draft.pullRequests) {
      // the pull request need not have arrived in pepys: the host looks no row up
      operations.push(linkProduced({ from: draft.id, to: toGithubPullRequestID(pullRequest.id), confidence: 1, evidence: pullRequest.evidence }));
    }
  }

  // An item with no `filed` fact in the scope yields no item row; its attempts still get rows.
  if (row !== undefined) {
    operations.push({ upsert: { boxxy_item: layItemChanges(row, edit, closed) } });
  }

  return JSON.stringify(operations);
}

// The draft of one attempt, made on first sight. An index loop; `updatedAt` is the latest `at`.
declare function findDraft(drafts: AttemptDraft[], id: BoxxyAttemptID, at: string): AttemptDraft;

// Adds the pair once. The first fact that names it wins, which is the earliest: the facts come
// sorted by `at`. A later fact with a product fills a null product.
// Determinism: two facts with an equal `at` can come in either order (`started` and
// `session_bound` of one attempt do). On an equal `at` the pair keeps the SMALLER fact ID as its
// evidence, so the `ran_in` link is the same in any order:
//   if (at === bound.at && evidence < bound.evidence) { bound.evidence = evidence; }
// This rule ran in a compiled module: the two orders gave equal output, byte for byte.
declare function bindSession(draft: AttemptDraft, session: TelemetrySessionID, key: 'atc' | 'agent', product: string | null, at: string, evidence: string): void;

// True when the draft holds the pull request. `id` is a string. The same tie rule as
// `bindSession`: when the draft holds it with an equal `at`, the entry keeps the smaller fact ID
// as its evidence.
// Not checked: the tie rule ran for `bindSession` ONLY. For this function it is applied by
// analogy and has not run.
declare function hasPullRequest(draft: AttemptDraft, id: string, at: string, evidence: string): boolean;

// Each `slept` time pairs with the earliest `woken` time at or after it. With none, and when the
// attempt settled asleep, it pairs with the settle time. With neither, `to` is null: asleep now.
// It compares `at` values as text. Every value is boxxy's own `toISOString()` output, which has
// one fixed form, so text order is time order.
declare function pairSleeps(draft: AttemptDraft): { from: string; to: string | null }[];

// lays the kept edit and close over the filed row; `updated_at` is the latest of the three times
declare function layItemChanges(
  row: BoxxyItemRow,
  edit: ItemEdit | undefined,
  closed: { at: string; reason: string } | undefined,
): BoxxyItemRow;

// What the generated glue must give for this file to compile. The typing rule of the kit's glue
// generator: objects to any depth, lists, optional and nullable fields are typed; a record and a
// union of object shapes are `unknown`. `fields.designMode` is typed only when the model's schema
// names `designMode` as a key of an object. A fact whose payload does not decode is left out of
// the read with no error. This file reads flat fields, plus `fields.designMode`, one level down.
// Not checked: the generator and the compiled decoder on this catalog. They ran for flat
// payloads only. The catalog has payloads with nested objects, lists, a record (`ItemRow.fields`)
// and a union of four shapes (`CloseOut`), and 27 members.
//
//   export type BoxxyWorkFact =
//     | { id: string; type: 'boxxy.item.filed'; at: string; payload: { kind: string; repo: string; title: string; fields: { designMode?: string }; … } }
//     | { id: string; type: 'boxxy.attempt.claimed'; at: string; payload: { attempt: string; phase: string; number: number; round: number; mode: string; pool: string; recipeHash: string; rulesVersion: string; … } }
//     | … one member per type, 27 in all …
//   export type TelemetrySessionID = KindedID<'telemetry:session'>;

// ═════════════════════════════════════════════════════════════════════════════════════════════
// G. boxxy repo, packages/pepys/package.json
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
//   {
//     "name": "@boxxy/pepys",
//     "files": ["src", "!src/**/*.test.ts"],          // `src` whole: the entry file AND src/generated
//     "exports": {
//       ".":        "./src/index.ts",                  // the plug-in: the cloud repo's deployment file
//       "./source": "./src/source.ts",                 // the family and the source: the sender
//       "./sink":   "./src/create-pepys-fact-sink.ts", // ../edge/02-outbox.ts, C1
//       "./reader": "./src/create-pepys-reader.ts"     // 03-readers.ts
//     },
//     "scripts": {
//       "glue":       "pepys build src/index.ts --out build/consumers",
//       "glue:check": "pepys build src/index.ts --check"      // CI: fails on stale glue
//     },
//     "dependencies": {
//       "@boxxy/model": "workspace:*",                 // the fact schemas, the two report schemas
//       "@orpc/client": "2.0.0-beta.50"                // the reader's RPC link; the version the pepys API pins
//     },
//     "peerDependencies": {
//       "@pepys/kit": "…",                             // every `define*`, `@pepys/kit/send`
//       "@pepys/source-github": "…",                   // `githubDeliveryConsumers`, `selectPullRequestDelivery`
//       "@pepys/source-telemetry": "…",                // the two telemetry consumers the cost query reads
//       "kysely": "…",
//       "zod": "…"
//     },
//     "devDependencies": {
//       "@pepys/cli": "…",                             // `pepys build`, for the glue and its check
//       "@pepys/testing": "…",                         // `createTestStore` (04-test.ts)
//       …and each peer dependency, at the version boxxy tests with
//     }
//   }
//
// Why peers: the deployment must hold ONE copy of the kit, of zod and of each of the two source
// plug-ins. A second copy of a source plug-in would give the query a table declaration that
// differs from the one the deployment built. The boxxy server installs the peers too; through
// `./source`, `./sink` and `./reader` it never loads the two source plug-ins.
//
// A defect in the existing code: `@boxxy/model` lists `@faker-js/faker` under `dependencies`
// (libs/model/package.json), so the cloud repo's image gets faker through this package. The
// build moves it to `devDependencies`, or to a `test-utils` package.
