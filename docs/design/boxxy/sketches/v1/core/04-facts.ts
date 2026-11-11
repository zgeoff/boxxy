// 04-facts.ts: the fact catalog of boxxy v1, on the stream `facts.boxxy.work`.
// Design sketch. It is not compiled.
//
// The build puts this catalog in place of `SliceOneFacts` in libs/model/src/facts/types.ts, of
// the schemas in libs/model/src/facts/fact-schemas.ts, and of the two tables of
// docs/design/boxxy/slice-1.md "Facts and the outbox".
// The boxxy pepys package (`@boxxy/pepys`) builds its fact family from this catalog: one zod
// schema per type, generated from these payload types, so the sender and the consumer share them.
//
// THE LEDGER RULE. boxxy is the only ledger of the work. Every text of an item
// (title, outcome, acceptance, labels, each note, each relation) is in a fact, in full. Nothing
// about an item's content lives only in boxxy's table, so pepys can rebuild every item from the
// stream. The catalog links to no outside tracker.
//
//   A. The envelope and the entity rule.
//   B. The catalog: type, payload, writer.
//   C. What the build changes in the existing code.
//   D. What pepys builds from it: tables, the `produced` link, and each measure.

import type { AgentSessionId, AtcSessionId, AttemptId, ClosingCause, CloseOut, CommitSha, ContentHash, Criterion, CriterionId, DecisionRow, DesignMode, Effect, EvidenceKind, FactId, FieldValues, Friction, Instant, ItemId, ItemKindName, ItemRow, LeverRow, RelationTypeName, Minutes, PhaseName, PoolName, Product, RecipeHash, RepoName, RulesVersion, SeatRef, SessionMode, WakeSource } from './02-types.ts';

// ── A. The envelope ────────────────────────────────────────────────────────────────────────────
//
//   field     value
//   ────────  ──────────────────────────────────────────────────────────────────────────────────
//   id        `event:boxxy:<event>`. `event` is the outbox row's `fact_id`, a UUID version 7.
//             The store's `FactId` has no prefix: the brand `brandSchemas.factId` is a bare UUID
//             version 7. The evidence ids an agent cites in a close-out are these same UUIDs.
//   type      `boxxy.<noun>.<past verb>`, from the table in B
//   entity    `boxxy:item:<item_id>`, for EVERY fact. See the rule below.
//   actor     `boxxy:owner:local`, `boxxy:runner:<runner_id>`, `boxxy:attempt:<attempt_id>` or
//             `boxxy:hook:<attempt_id>`
//   at        the change's `at`, as an ISO 8601 string on the wire. Instants inside a payload are
//             epoch milliseconds, boxxy's `Instant`.
//   payload   the type's payload, and `storeVersion` (the outbox row's `seq`), which the sink adds
//
// `storeVersion` is a field of the WIRE schema only. Each type has two schemas, in two places:
//   the model's schema   `workFactSchemas` in `@boxxy/model` (libs/model/src/facts/fact-schemas.ts): one
//                        zod schema per type of `WorkFacts` below, with no `storeVersion`. The
//                        store checks each fact against it in `applyChange`, and the outbox row
//                        holds that payload.
//   the wire schema      in `@boxxy/pepys` (packages/pepys/src, the fact family of `boxxySource`):
//                        each model schema extended with `storeVersion: number`. The sink adds the
//                        field when it builds an `OutgoingFact`; ingest parses against this schema.
// So the payload types in B have no `storeVersion`, and a strict wire schema refuses no fact.
//
// The entity rule. Every fact on this stream names an item as its entity, and a fact about an
// attempt, a decision or a pull request names the attempt in its payload. The reason: the
// family's `entityKind` is `boxxy:item`, the consumer `boxxy_work` runs in scope mode with
// `scopeKind: 'boxxy:item'`, and one scope holds every fact of one item, so the consumer
// rebuilds an item, its attempts and its sessions from one read, in any arrival order.
//
// Two kinds of fact do not fit, and each gets one answer:
//   - A relation joins two items. Its entity is the SOURCE item; the target is in the payload.
//     No v1 table reads relations, so the target's scope never needs the fact.
//   - A runner pause or resume names no item. This stream has no fact type for either:
//     `runner.pause` and `runner.resume` write the `runners` row and no fact. The alternative,
//     not part of v1, is a second family, `facts.boxxy.runner`, with
//     `entityKind: 'boxxy:runner'` and no consumer.

export type EntityRef = `boxxy:item:${string}`;

// what every attempt-scoped payload starts with
interface OfAttempt {
  readonly attempt: AttemptId;
}

// ── B. The catalog ─────────────────────────────────────────────────────────────────────────────

export interface WorkFacts {
  // ── items ──

  // written by: `item.file`; settle, for each `file-item` effect (through dedupe)
  'boxxy.item.filed': ItemRow; // id, kind, repo, title, outcome, acceptance, fields (designMode), labels, foundInAttempt, filedBy, filedAt

  // written by: `item.note`. The FULL text of one note; notes are append-only.
  'boxxy.item.noted': { readonly seq: number; readonly text: string };

  // written by: `item.edit`; settle, for the effects `set-kind`, `set-field` (designMode) and
  // `set-acceptance`; settle, when it copies evidence ids into the acceptance list
  'boxxy.item.edited': {
    readonly title?: string;
    readonly outcome?: string;
    readonly acceptance?: readonly Criterion[];
    readonly kind?: ItemKindName;
    readonly fields?: { readonly designMode?: DesignMode };
    readonly labels?: readonly string[]; // the whole new list
    readonly byAttempt: AttemptId | null; // the attempt whose settle made the edit
  };

  // written by: `item.close`; settle, for the effect `close-item` (triage: duplicate, declined)
  // Under the v1 rules a triage `duplicate` or `declined` holds the item and runs
  // no `close-item`, so `item.close` (the owner's confirm) is the only writer in v1.
  // `ended` lists each live attempt that this close ended. `settled`: a sleeping attempt,
  // whose `boxxy.attempt.settled` is in the same change. `closing`: an attempt whose session ran;
  // this fact is the fact of its move to `closing`, and its `settled` follows the stop.
  'boxxy.item.closed': { readonly reason: string; readonly byAttempt: AttemptId | null; readonly ended: readonly { readonly attempt: AttemptId; readonly how: 'settled' | 'closing' }[] };

  // written by: `relation.add`; `item.file`, one per `--blocked-by`; settle, for `add-relation`.
  // entity: the source item
  'boxxy.relation.added': { readonly source: ItemId; readonly target: ItemId; readonly type: RelationTypeName };

  // written by: `relation.remove`
  'boxxy.relation.removed': { readonly source: ItemId; readonly target: ItemId; readonly type: RelationTypeName };

  // written by: `plan.*`, and `item.retry` (which may carry `phase`)
  'boxxy.lever.recorded': LeverRow & { readonly phase?: PhaseName };

  // ── the claim ──

  // written by: `claimNext`, for a start pick. `at` is the claim time
  'boxxy.attempt.claimed': OfAttempt & {
    readonly phase: PhaseName;
    readonly number: number; // 1, 2, 3… over the item's attempts
    readonly round: number; // the item's round: 1, then one higher each time a `to` edge or `retry --phase` sent the item back
    readonly mode: SessionMode;
    readonly pool: PoolName;
    readonly fields: FieldValues;
    readonly seats: readonly SeatRef[];
    readonly recipeHash: RecipeHash;
    readonly skillsRef: CommitSha | null; // the skills pin of the rules at the claim
    readonly rulesVersion: RulesVersion;
  };

  // written by: `claimNext`, for a start pick and for a wake pick
  'boxxy.decision.recorded': DecisionRow; // holds `attempt`, `item`, `kind: 'start' | 'wake'`, `limits`

  // ── the session ──

  // written by: `startClaim` on a `started` outcome; the runner, reading `running` × `starting`.
  // `atcSession` is the telemetry join key: atc stamps it on every telemetry record of the session.
  // `resumeFallback`. True: the claim was to wake the item's kept session, and it
  // fell back to a fresh spawn. A woken kept session gives the SAME `atcSession` as the attempt
  // it came from.
  // `caller`, on this fact, on `.reconciled` and on `.resumed`: `AttemptRow.caller`,
  // `{ issuer, subject }` or null. pepys counts a telemetry row for an attempt only when the
  // row's proven origin is this caller (../pepys-package/02-queries.ts).
  'boxxy.attempt.started': OfAttempt & { readonly atcSession: AtcSessionId; readonly resumeFallback: boolean; readonly caller: CallerIdentity | null };

  // written by: `startClaim` on an `unknown` outcome
  'boxxy.attempt.spawn_unanswered': OfAttempt & { readonly reason: string };

  // written by: the runner, reading `running` × `reconciling`. `caller`: see `.started`
  'boxxy.attempt.reconciled': OfAttempt & { readonly atcSession: AtcSessionId; readonly caller: CallerIdentity | null };

  // written by: the runner (a `started` outcome of start or resume, any reading), the procedure
  // `attempt.bindSession` (the SessionStart hook), and any `attempt.*` call that carries a new id.
  // One fact per new `attempt_sessions` row
  'boxxy.attempt.session_bound': OfAttempt & {
    readonly atcSession: AtcSessionId;
    readonly agentSession: AgentSessionId;
    readonly product: Product;
    readonly source: 'worker' | 'hook';
    readonly seenAt: Instant;
  };

  // ── sleep and wake ──

  // written by: the runner, after the worker confirmed the stop, or on a `suspended` reading;
  // `resumeClaim`, for a wake that the host refuses for capacity (the event `wake-refused` in
  // 03-flow.ts), so that each `woken` has a `slept` after it and the sleep stretches pair up.
  // `at` is when the seats were released. `asked: false`: the host slept with no request
  'boxxy.attempt.slept': OfAttempt & { readonly idleSince: Instant; readonly asked: boolean };

  // written by: `attempt.wake` (`boxxy item wake`), and the runner (`session-ran`, `host-slept-unasked`)
  'boxxy.attempt.wake_requested': OfAttempt & { readonly by: WakeSource };

  // written by: `claimNext`, for a wake pick. `at` is when the attempt holds its seats again.
  // Also by `actOnReading`, for a wake over the cap.
  // `overCap`. True for a wake over the cap. The `decision.recorded` fact
  // of that wake records each such limit's count and `max` at that moment.
  'boxxy.attempt.woken': OfAttempt & { readonly holdGen: number; readonly seats: readonly SeatRef[]; readonly overCap: boolean };

  // written by: `resumeClaim`; the runner, reading `running` × `waking`. `caller`: see `.started`
  'boxxy.attempt.resumed': OfAttempt & { readonly atcSession: AtcSessionId; readonly caller: CallerIdentity | null };

  // ── the end ──

  // written by: `attempt.closeOut`, for the first valid close-out. The attempt moves to `closing`.
  // `closeOut` is 120,000 bytes at most as JSON (`closeOutLimits`), so
  // this fact always fits one outbox item. A review's `closeOut.noslop` is `NoslopSummary`.
  'boxxy.attempt.closed_out': OfAttempt & { readonly phase: PhaseName; readonly closeOut: CloseOut; readonly hash: ContentHash };

  // written by: the runner, past the step's `timeoutMinutes`. The attempt moves to `closing`
  'boxxy.attempt.timed_out': OfAttempt & { readonly phase: PhaseName; readonly afterMinutes: Minutes };

  // written by: the runner, in agent mode, when the turn ended with no close-out. ─▶ `closing`
  'boxxy.attempt.turn_ended': OfAttempt & { readonly phase: PhaseName };

  // written by: `settleAttempt`. `at` equals `endedAt`. No `next`: the position is derived
  'boxxy.attempt.settled': OfAttempt & {
    readonly phase: PhaseName;
    readonly round: number;
    readonly state: 'succeeded' | 'failed';
    // `closeout-missing`, `closeout-unsettleable`, a forced reason (`item-closed` is one), or
    // the close-out's reason.
    readonly failure: string | null;

    // a name from the phase kind's list, or `lost`, or `unsettleable` (only with the failure
    // `closeout-unsettleable`). Never a name the phase kind does not list
    readonly outcome: string;

    // the name the phase code returned when its kind does not list it; else null
    readonly returnedOutcome: string | null;
    readonly closing: ClosingCause | null; // null: the session was already gone. Can be `item-closed`
    readonly asleep: boolean; // the attempt settled from `sleeping`
    readonly sessionStopped: boolean; // false: settled by the give-up rule
    readonly endedAt: Instant;
    readonly criteria: readonly { readonly criterion: CriterionId; readonly evidence: readonly FactId[] }[];
    readonly matched: readonly ItemId[];
    readonly frictionDropped: number;
    readonly skippedEffects: readonly { readonly effect: Effect['kind']; readonly reason: string }[];
  };

  // written by: settle, for each `record-proposal` effect
  'boxxy.proposal.recorded': OfAttempt & Friction;

  // ── evidence and pull requests ──

  // written by: `attempt.evidence` (a test, a CI run, a live check)
  'boxxy.evidence.recorded': OfAttempt & { readonly kind: EvidenceKind; readonly ref: string; readonly observed: string | null };

  // written by: `attempt.recordPullRequest` (the PostToolUse hook; the procedure is in
  // ../edge/01-api.ts) and the pull request watch, in the change that writes the pull request row
  'boxxy.pull_request.linked': OfAttempt & {
    readonly repo: RepoName;
    readonly number: number;
    readonly url: string;
    readonly pullRequestId: string /* decimal text of the GitHub database ID */; // see D, "The `produced` link"
    readonly source: 'hook' | 'watch';
  };

  // written by: the pull request watch, once per commit
  'boxxy.commit.linked': OfAttempt & { readonly repo: RepoName; readonly sha: CommitSha; readonly pullRequestNumber: number };

  // written by: the pull request watch. boxxy's own sighting, which drives the item's derived
  // state. pepys takes the merge TIME from `github_pull_request`, never from this fact.
  'boxxy.pull_request.merged': OfAttempt & { readonly repo: RepoName; readonly number: number; readonly pullRequestId: string /* decimal text of the GitHub database ID */; readonly mergedAt: Instant; readonly mergeCommit: CommitSha };

  // written by: the pull request watch, for a close with no merge
  'boxxy.pull_request.closed': OfAttempt & { readonly repo: RepoName; readonly number: number; readonly pullRequestId: string /* decimal text of the GitHub database ID */ };
}

export type FactType = keyof WorkFacts; // 27 types

// ── C. What the build changes in the existing code ─────────────────────────────────────────────
//
// The existing catalog is `SliceOneFacts`, with its schemas (the files are named at the top of
// this file). The catalog in B is the rule; this list names the differences from that code.
//
//   rename    boxxy.link.added, .removed        ─▶ boxxy.relation.added, .removed
//             boxxy.evidence.pr_linked          ─▶ boxxy.pull_request.linked
//             boxxy.evidence.commit_linked      ─▶ boxxy.commit.linked
//             boxxy.pr.merged, boxxy.pr.closed  ─▶ boxxy.pull_request.merged, .closed
//             boxxy.attempt.reconciling         ─▶ boxxy.attempt.spawn_unanswered   (a past verb)
//   add       boxxy.attempt.slept, .wake_requested, .woken, .resumed, .timed_out, .turn_ended
//             boxxy.item.noted
//   remove    boxxy.runner.paused, boxxy.runner.resumed   (no item to name)
//   change    fact id: remove the `manual:` prefix of the store's `FactId`
//             entity: make every entity `boxxy:item:<id>`, and add `attempt` to every attempt fact
//             claimed: remove `slot`, `gen`; add `round`, `mode`, `fields`, `seats`
//             settled: add `phase`, `round`, `outcome`, `closing`, `asleep`, `sessionStopped`,
//               `skippedEffects`
//             session_bound: add `product`, `source`
//             closed_out: add `phase`, `hash`; the close-out is one of four shapes
//             pull_request.*: add `pullRequestId`
//             item.edited: add `kind`, `fields`, `byAttempt`
//           This list is a guide. The catalog in B is the rule for every payload field.
//
// The suspend mark (`suspendRequestedAt`), `sessionStoppedAt` and `sessionForgottenAt` write no
// fact. They are the only attempt columns that change with none. The first two are recovery
// state of a worker call, not a change of what the attempt is. No fact type for session cleanup
// exists, so the attempt row alone holds the third.

// ── D. What pepys builds ───────────────────────────────────────────────────────────────────────
//
// Tables of the consumer `boxxy_work` (one scope per item; each scope is rebuilt from its facts):
//
//   boxxy_item              id (`boxxy:item:<id>`), kind, repo, title, design_mode, filed_at,
//                           closed_at, close_reason, updated_at
//                           from: item.filed, item.edited, item.closed
//
//   boxxy_attempt           id (`boxxy:attempt:<id>`), item_id, phase, number, round, mode, pool,
//                           recipe_hash, rules_version, atc_session, state, outcome, failure,
//                           claimed_at, started_at, closed_out_at, ended_at, slept_ms, sleeps,
//                           updated_at
//                           from: attempt.claimed, .started, .reconciled, .closed_out, .slept,
//                           .woken, .settled
//
//   boxxy_attempt_session   attempt_id, agent_session, atc_session, product, seen_at
//                           primary key (attempt_id, agent_session)
//                           from: attempt.session_bound
//
// The package `@boxxy/pepys` owns the final columns of these three tables. Where a list above
// differs from `../pepys-package/01-package.ts`, the package file stands. It differs in the key
// and the columns of `boxxy_attempt_session`, and in a list of sleep stretches in place of
// `slept_ms`.
//
// The telemetry join. The key is the atc session id:
//   - boxxy knows the id from the spawn answer, with no race, and a wake keeps it. atc stamps
//     it on every telemetry record as the resource attribute `atc.session.id`.
//   - The join must neither drop cost (an attempt with no agent session id seen) nor count it
//     twice (an attempt with several agent session ids after a `/clear`).
//   - The agent session id is the fallback key, for a telemetry row that carries no
//     `atc.session.id`.
//   - The join table is `boxxy_attempt_session` as `../pepys-package/01-package.ts` has it, and
//     the join itself is in `../pepys-package/02-queries.ts`. Both stand.
//
// The consumer `boxxy_work` writes three link types:
//   ran_in       `boxxy:attempt:<id>` ─▶ `telemetry:session:<id>`       from `started`, `reconciled`, `resumed`, `session_bound`
//   produced     `boxxy:attempt:<id>` ─▶ `github:pull_request:<id>`     from `pull_request.linked`
//   attempt_of   `boxxy:attempt:<id>` ─▶ `boxxy:item:<id>`              from `claimed` (the entity gives the item)
// Without `attempt_of`, pepys's `neighbourhood` from an item returns the item alone.
//
// The far end of `ran_in` holds the atc session id, or the agent session id for the fallback
// row written from `boxxy.attempt.session_bound`. The exact id of each end is in
// `../pepys-package/01-package.ts`, section D.
//
// The `produced` link, from `boxxy:attempt:<attempt>` to `github:pull_request:<id>`, written
// from `boxxy.pull_request.linked`:
//   - boxxy's own key for a pull request is `(repo, number)`, and it stores the URL. None of
//     these is the pepys entity id.
//   - The pepys entity id holds GitHub's own `id` of the pull request: the GitHub consumer builds
//     it from the webhook's `pull_request.id` (pepys:
//     packages/source-github/src/consumers/github-pull-request.ts, which spells the prefix
//     `github:pr:`; this design links to the kind `github:pull_request`).
//   - So boxxy stores that number too: `pull_requests.githubId`, from the forge
//     (`GET /repos/{owner}/{repo}/pulls/{number}`, field `id`).
//   - `attempt.recordPullRequest` reads the forge BEFORE it writes. When the forge answers, one
//     change writes the `pull_requests` row, the evidence row and this fact, so the fact and its
//     rows stay in one transaction (decision 0013). When the forge does not answer, the procedure
//     writes nothing and answers `retry`; the pull request watch, which already links each pull
//     request the hook missed, links it within 5 minutes by the same change. So `githubId` is
//     never null in a stored row, and every `pull_request.linked` fact carries the id.
//   - The link needs no GitHub fact to have arrived: the consumer writes it from the id alone.
//
// The measures, each with the facts and fields it reads:
//
//   time per phase    per attempt: `settled.endedAt` − `claimed.at`, minus the attempt's sleep
//                     time. Per item and phase: the sum over the attempts with that `phase`.
//                     Time in `closing` counts: the session still runs.
//   merge, release,   not from boxxy. From the GitHub tables, reached through `produced`:
//   deploy            `github_pull_request.merged_at`, then the release and deploy rows.
//   rework            Count: the `settled` facts with `phase: review` and
//                     `outcome: changes-requested`. This is the definition. The highest `round`
//                     − 1 is not: the review that hits the cap raises no round, and a
//                     `retry --phase` raises one.
//                     Time: the time of every attempt with `round` > 1. `round` is the item's
//                     round, so the review of a reworked build is in it.
//   review wait       for each `settled` with `phase: build` and `outcome: built`: the `at` of the
//                     next `claimed` with `phase: review` on the item, minus `settled.endedAt`.
//   sleep time        per attempt: the sum, over each `slept`, of the next `woken.at` − `slept.at`.
//                     For an attempt that settles asleep (`settled.asleep`): `settled.endedAt` −
//                     the last `slept.at`. The time from `woken` to `resumed` counts as running.
//   wait for a seat   after a wake request: `woken.at` − `wake_requested.at`.
//                     A `settled` with `failure: no-capacity` is not an
//                     attempt of work: no measure above counts it, and it is no rework.
//   attempts lost     `settled` with `outcome: lost`, by `failure`. `item-closed` is one
//                     of these; a query of lost work leaves it out, because the owner chose it.
//                     A `settled` with `failure: closeout-unsettleable` is work done whose
//                     result boxxy could not read; it counts in time per phase.
