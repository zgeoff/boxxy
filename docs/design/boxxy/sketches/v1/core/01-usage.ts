// 01-usage.ts: the calling code of boxxy's core for v1.
// Design sketch. It is not compiled.
//
//   1. rules.yaml: the pipeline, the limits, the pools, the sleep time.
//   2. One phase file.
//   3. The runner tick.
//   4. Inside a session: the close-out and the session hook.
//   5. The owner: wake, retry.
//   6. Tests with no SQLite file and no atc.

import { expect, test } from 'bun:test';
import type { ClaimStore, CloseOutContext, CloseOutParser, CloseOutProblem, GateReading, Instant, LoadedRules, PhaseInputContext, Procedures, ReviewGate, ReviewInput, RunnerId, WorkerKind } from '@boxxy/model';
import { brandSchemas, definePhase, findPosition, reviewCloseOutSchema, toJSONValue } from '@boxxy/model';
import type { z } from 'zod';
import { actOnReading, claimNext, closeOutAttempt, pickReadingAction, resumeClaim, startClaim, timeouts } from '@boxxy/dispatch';
import type { CapacityBackoff, ItemId } from '@boxxy/model';
import { createFakeFactSink, outboxLimits, runSenderOnce, toWireItem } from '@boxxy/outbox'; // for the size test

// ── 1. rules.yaml ──────────────────────────────────────────────────────────────────────────────
//
// This file takes the place of the `pools` block and of the kinds' `maxAttempts` in
// docs/design/boxxy/slice-1.md.
//
//   version: 1
//   concepts: [pool@2, defer@1, expedite@1]      # pool@2 adds the filter field `designMode`
//
//   pipelines:
//     standard:
//       - phase: triage
//         maxAttempts: 2
//         timeoutMinutes: 20
//         on:                                    # every outcome of the phase kind, or the load fails
//           accepted:  next
//           duplicate: { hold: duplicate }           # the owner confirms
//           declined:  { hold: declined }            # with `boxxy item close`, or `boxxy item retry`
//       - phase: design
//         maxAttempts: 2
//         timeoutMinutes: 90                     # Required on every step. It is the clock of an
//                                                # agent-mode attempt. An attended attempt has no step
//                                                # clock; `sleep.afterQuietMinutes` covers it instead.
//         on:
//           designed:  next
//           blocked:   { hold: blocked }         # The agent's question. The close-out holds
//                                                # the question, the owner gets a notice, answers with
//                                                # `boxxy item note` and `boxxy item retry`.
//           abandoned: again                     # the same phase again, counted against maxAttempts
//       - phase: build
//         maxAttempts: 2
//         timeoutMinutes: 180
//         on:
//           built:     next
//           blocked:   { hold: blocked }         # the agent's question, as in design
//           abandoned: again
//       - phase: review
//         maxAttempts: 2
//         timeoutMinutes: 45
//         on:
//           passed:            { end: reviewed }
//           changes-requested: { to: build, max: 3, resume: true }   # the rework wakes the
//                                                # build's kept session; a fresh spawn is the fallback
//           failed:            again             # a failed call, an unreadable or uncovered result
//
//   kinds:
//     core.idea:  { pipeline: standard, recipes: { triage: triage-v1, design: design-v1, design/attended: design-attended-v1, build: build-v1, review: review-run } }
//     core.issue: { pipeline: standard, recipes: { ...the same } }
//
//   skills:                                      # ONE commit of the public skills repo
//     source: example/skills
//     ref: 4f1c9e07a2b35d68c0e1f7a9b3d5c2e8f6a4b1d0
//
//   relationTypes: [blocks, duplicate-of, relates-to]   # registry data
//
//   recipes:                                     # A recipe lists the skills its phase needs.
//                                                # The pin and the list are part of the recipe hash.
//     # Each recipe also has the `prompt` path and the capacity `source` of the existing `Recipe`
//     # type; modules/rules/example/rules.yaml, the file that a loader test loads, shows them.
//     # Every v1 recipe but review-run runs Claude Opus 5.5 at medium effort. Rules data only: `agent`,
//     # `model` and `effort` are fields of the existing `Recipe` type. v1 workers are Claude; Codex as a
//     # worker is later.
//     triage-v1:          { agent: claude, model: claude-opus-5-5, effort: medium, skills: [] }
//                                                # Its text says to accept no criterion
//                                                # that only a release or a live run can prove
//     design-v1:          { agent: claude, model: claude-opus-5-5, effort: medium, skills: [bake-off] }
//     design-attended-v1: { agent: claude, model: claude-opus-5-5, effort: medium, skills: [bake-off] }
//     build-v1:           { agent: claude, model: claude-opus-5-5, effort: medium, skills: [] }
//                                                # A build recipe names no check command; its text
//                                                # says to follow the repo's own agent instructions for checks.
//     review-run:         { agent: claude, model: claude-haiku-5-5, effort: low, skills: [] }
//                                                # The session only runs the gate's command and
//                                                # sends its file; the review tool does the review.
//
//   limits:
//     - { name: workers,      max: 7, counts: {} }
//     - { name: owner-design, max: 1, counts: { phase: design, designMode: attended } }
//
//   pools:                                       # a filter and a sort; no count
//     - { name: triage,            takes: { phase: triage },                       order: [oldest] }
//     - { name: design-with-owner, takes: { phase: design, designMode: attended }, order: [oldest] }
//     - { name: design,            takes: { phase: design, designMode: agent },    order: [oldest] }
//     - { name: review,            takes: { phase: review },                       order: [oldest] }
//     - { name: build,             takes: { phase: build },                        order: [oldest] }
//
//   sleep:
//     afterIdleMinutes: 30                       # a session that waits for the owner this long sleeps
//     afterQuietMinutes: 60                      # an attended session that reads `working` with no
//                                                # activity at all for this long also counts as waiting
//     afterUnattendedMinutes: 240                # an attended session whose agent stays active
//                                                # sleeps when the owner has not attached for this long
//
// An item that sets no `designMode` has the filter value `agent`, so it lands in the pool `design`.
//
// A load fails, with the reason typed (`LoadRejectionReason`), when: an outcome of a phase kind
// has no entry in `on` (`unmapped-outcome`); `on` names an outcome the phase kind lacks
// (`unknown-outcome`); a backward `to` has no `max` (`open-loop`); a pool has `slots`; a filter
// names an unknown field; no limit is sure to count a pool's attempts; a step has no
// `timeoutMinutes` (`step-without-timeout`); `afterQuietMinutes` is below `afterIdleMinutes`; a
// `hold` edge names an engine hold reason (`engine-hold-reason`). `lead` and `propagation` are
// optional, and empty when the file leaves them out.

// ── 2. modules/closeout/src/phases/create-review-phase.ts ──────────────────────────────────────
// `outcomes` is the one list. The loader checks `on` against it, and the compiler checks the
// `outcome` that `settle` returns against it: `outcome: 'approved'` here is a type error
// (libs/model/src/rules/define-phase.test.ts proves it). `definePhase` infers the body, the input
// and the outcomes. An input interface is not a `JsonValue` (it has no index signature), so
// `input` returns `toJSONValue` of the typed value.

declare const buildSchemaParser: <Raw, Body>(input: { schema: z.ZodType<Raw>; toBody: (raw: Raw, frictionDropped: number) => Body; check: (body: Body, ctx: CloseOutContext) => readonly CloseOutProblem[] }) => CloseOutParser<Body>;
// the round, its cause, the pull request and the gate's command (sketches/next/review-and-merge/03-flow.ts, section C)
declare const buildReviewInput: (ctx: PhaseInputContext, buildCommand: ReviewGate['buildCommand']) => ReviewInput;
declare const pickReviewOutcome: (reading: GateReading) => 'passed' | 'changes-requested' | 'failed';

// The session sends the review tool's raw result. The server builds the `ReviewCloseOut` from
// `ReviewGate.accept`'s reading (sketches/next/review-and-merge/03-flow.ts, section B), and this
// parser reads the built body. The server passes the gate's pure `buildCommand` in.
export const createReviewPhase = (deps: Pick<ReviewGate, 'buildCommand'>) => definePhase({
  name: brandSchemas.phaseName.parse('review'),
  version: 2,
  worker: brandSchemas.workerKindName.parse('atc.session'),
  outcomes: ['passed', 'changes-requested', 'failed'],
  needsAcceptance: true,
  input: (ctx) => toJSONValue(buildReviewInput(ctx, deps.buildCommand)),
  closeOut: buildSchemaParser({ schema: reviewCloseOutSchema, toBody: (raw) => raw, check: () => [] }),
  settle: ({ closeOut }) => {
    const outcome = pickReviewOutcome(closeOut.reading);

    return { state: outcome === 'failed' ? 'failed' : 'succeeded', failure: outcome === 'failed' ? 'review-failed' : null, outcome, effects: [], frictionDropped: 0 };
  },
});

// design.ts adds `mode: (item) => (item.fields.designMode === 'attended' ? 'attended' : 'agent')`.
// A design or build close-out that is `blocked` or `abandoned` settles `failed`, with the
// agent's reason as the failure, so no session is kept for it (docs/design/boxxy/close-outs.md).

// ── 3. apps/server/src/run-tick.ts (the build adds this file) ──────────────────────────────────

interface TickDeps {
  readonly runner: RunnerId;
  readonly store: ClaimStore;
  readonly worker: WorkerKind;
  readonly rules: LoadedRules;
  readonly now: Instant;
  // The runner's memory of the pools that a host refused for
  // capacity. `claimNext` reads it; `startClaim` and `resumeClaim` mark it.
  readonly backoff: CapacityBackoff;
}

export async function runTick(deps: TickDeps): Promise<void> {
  await deps.store.exclusive(async (tx) => {
    await tx.writeHeartbeat(deps.runner, deps.now);
    await tx.syncLimits(deps.rules.limits, deps.now); // seats move only when the limits changed
  });

  // A claim is a new attempt or a woken one. Both hold their seats before a worker call runs.
  // The loop must end, and the readings below must run in every tick.
  //   1. `claimNext` gives no pick, start or wake, in a pool that `deps.backoff` holds. A wake
  //      that the host refuses for capacity marks its pool (`resumeClaim`), as a refused spawn
  //      does (`startClaim`). `deps.now` is one value for the tick, so the mark outlasts the loop.
  //   2. No item is claimed twice in one tick. `claimNext` takes the items that the tick
  //      claimed and gives no pick, start or wake, of one of them. It is the guard for a case
  //      that rule 1 does not cover, such as an item whose first spawn was refused for another
  //      cause: its attempt settles, and without the guard the same tick claims and spawns it
  //      again. The next tick goes on with it.
  //   3. An error in the loop (`ClaimRaceError`, a worker call that throws) ends the loop, not
  //      the tick. An attempt that it left in `starting` or `waking` is read below.
  // Without these rules, a wake that the host refuses goes back to `sleeping` with its request,
  // `decide` picks it first again, the loop of one tick never ends, and no reading runs.
  const claimed = new Set<ItemId>();

  try {
    for (let claim = await claimNext({ ...deps, claimed }); claim !== null; claim = await claimNext({ ...deps, claimed })) {
      await (claim.kind === 'start' ? startClaim({ ...deps, claim }) : resumeClaim({ ...deps, claim }));

      claimed.add(claim.attempt.item);
    }
  } catch (error) {
    console.error('claim loop ended', error);
  }

  // One reading per live attempt, `closing` included. The table is pure; `actOnReading` runs it.
  for (const attempt of await deps.store.read((tx) => tx.listLiveAttempts())) {
    const reading = await deps.worker.reconcile(attempt);
    const action = pickReadingAction({ attempt, reading, step: findStep(deps.rules, attempt), sleep: deps.rules.sleep, now: deps.now }); // `sleep`: the sleep times of the rules

    await actOnReading({ ...deps, attempt, reading, action });
  }

  // Sessions of attempts that the give-up rule settled while they still ran.
  for (const stray of await deps.store.read((tx) => tx.listStrayAttempts(deps.now - timeouts.strayHours * 3_600_000))) {
    await stopStray({ ...deps, attempt: stray });
  }

  // then the outbox sender and the pull request watch, as docs/design/boxxy/slice-1.md has them
}

// ── 4. Inside a session ────────────────────────────────────────────────────────────────────────
//
//   boxxy attempt close-out < close-out.json        no `--phase`: the attempt row holds the phase
//
// apps/cli/src/commands/attempt-close-out.ts

declare const rpc: { [P in keyof Procedures]: (input: Procedures[P]['input']) => Promise<Procedures[P]['output']> };

// The CLI reads no session ID. It asks `attempt.current`, which the server
// answers from the proven caller of the request, and sends that attempt's ID with the close-out.
export async function runAttemptCloseOut(env: Record<string, string | undefined>, stdin: string): Promise<number> {
  const current = await rpc['attempt.current']({});

  if (current.kind !== 'attempt') {
    console.error('no attempt for this session yet; try again in 5 seconds');

    return 2;
  }

  const answer = await rpc['attempt.closeOut']({ session: { attempt: current.attempt.id }, closeOut: JSON.parse(stdin) });

  switch (answer.kind) {
    case 'recorded':
      console.log(answer.factId); // the same id on a repeat of the same body

      return 0;
    case 'rejected':
      for (const problem of answer.problems) {
        console.error(describeProblem(problem)); // every problem at once; the attempt stays open
      }

      return 1;
    case 'refused':
      console.error(
        answer.reason === 'no-attempt'
          ? 'no attempt for this session yet; try again in 5 seconds'
          : answer.reason === 'already-closed-out'
            ? 'this attempt already has a close-out, and the first valid close-out is final'
            : 'this attempt is over',
      );

      return 1;
  }
}

// Built: apps/cli/src/commands/attempt-commands.ts. `evidence` and `close-out` both ask `attempt.current` first. A refused
// answer exits 2 with the retry message. The hooks are in apps/cli/src/hooks/ and the plug-in is apps/cli/hook-plugin/;
// docs/design/boxxy/v1-cli.md describes both.
//
// The `boxxy` CLI and the hook plugin are in the agent image; no `pluginDirs`.
// The hook first fetches the recipe's skills at the rules' pin into the workspace skills folder
// (`attempt.current` names them), then binds. A named skill that is missing after the fetch
// goes in `missingSkills`, and the attempt settles as `failed`, `skill-missing`.
// The plugin's SessionStart hook runs `boxxy hook session-start`, which calls
// `attempt.bindSession` with the agent session id from the hook payload.

// ── 5. The owner ───────────────────────────────────────────────────────────────────────────────
//
//   boxxy status                              lists each sleeping attempt, its item and its atc session
//   boxxy item wake <item>                    asks for the wake; the next tick's claim takes the seats
//   boxxy item close <item> --reason …        also ends the item's live attempt: a sleeping one
//                                             settles at once with no wake, any other is stopped, then settled
//   boxxy item retry <item>                   lifts a hold and resets both counts
//                                             from a triage hold (`declined`, `duplicate`)
//                                             it sends the item back to triage
//   boxxy item close <item> --reason …        the owner's confirm of a triage `declined`
//                                             or `duplicate`; the triage settle itself closes nothing
//   boxxy item note <item> --text …           appends a note; the next attempt gets it
//   boxxy item close <item> --reason duplicate --of <other>   closes and adds `duplicate-of`
//   boxxy rules dry-run rules.yaml            loads the file and prints, for each open item,
//                                             the position it has now and the one it would get, and
//                                             which items move. It writes nothing. Run it before a
//                                             rules change merges (procedure `rules.dryRun`)
//   boxxy item retry <item> --phase build     the same, and sets the position: the path back to
//                                             build after a passed review whose pull request closed

// ── 6. Tests ───────────────────────────────────────────────────────────────────────────────────
//
// The built tests are in modules/dispatch/src, beside the code each one calls, on the memory
// store, the fake worker and the fake clock (`createTestDispatch`). Clock moves below are in
// minutes.

// libs/model/src/pipeline/find-position.test.ts. Pure: a pipeline and settled attempts. No store.
test('it sends the item back to build with round 2 after a review that requests changes', () => {
  const position = findPosition({
    pipeline: buildMockPipeline(), // the `standard` pipeline above
    attempts: [
      { phase: 'triage', outcome: 'accepted', endedAt: 1000 },
      { phase: 'design', outcome: 'designed', endedAt: 2000 },
      { phase: 'build', outcome: 'built', endedAt: 3000 },
      { phase: 'review', outcome: 'changes-requested', endedAt: 4000 },
    ],
    retries: [],
  });

  // the build of round 2, and the review after it, both carry round 2
  expect(position).toStrictEqual({ kind: 'phase', phase: 'build', round: 2 });
});

test('it holds the item when a stored outcome is not in the current rules', () => {
  const position = findPosition({
    pipeline: buildMockPipeline(),
    attempts: [{ phase: 'triage', outcome: 'needs-split', endedAt: 1000 }], // a later rules file dropped it
    retries: [],
  });

  expect(position).toStrictEqual({ kind: 'hold', reason: 'outcome not in rules', then: 'triage', round: 1 });
});

// modules/dispatch/src/act-on-reading.test.ts. The memory store and the fake worker.
test('it does not settle an attended session whose turn ended with no close-out', async () => {
  const { worker, clock, claimAttended, tick, readAttempt } = setupTest();
  const attempt = await claimAttended();

  worker.setSession(attempt.id, { state: 'running', attention: 'turn-ended', lastActivityAt: clock.now, agentSession: 'agent-session-1' });
  await tick();

  expect((await readAttempt(attempt.id)).state).toBe('running');
});

test('it keeps the seats of a closed-out attempt until its session stops', async () => {
  const { worker, clock, claimAttended, tick, readAttempt, heldSeats } = setupTest();
  const attempt = await claimAttended();

  worker.setSession(attempt.id, { state: 'running', attention: 'turn-ended', lastActivityAt: clock.now, agentSession: 'agent-session-1' });
  await rpc['attempt.closeOut']({ session: { attempt: attempt.id } /* the test client's fake `CallerProof` gives the attempt's caller */, closeOut: buildMockDesignCloseOut() });

  expect((await readAttempt(attempt.id)).state).toBe('closing');
  expect(await heldSeats(attempt.id)).toEqual(['workers', 'owner-design']);

  await tick(); // `running` × `closing`: the runner sends `stop`; the fake's session becomes `suspended`
  await tick(); // `suspended` × `closing`: settle

  expect((await readAttempt(attempt.id)).state).toBe('succeeded');
  expect(await heldSeats(attempt.id)).toEqual([]);
});

test('it settles a closing attempt whose session does not stop, and frees its seats', async () => {
  const { worker, clock, claimAttended, tick, readAttempt, heldSeats } = setupTest();
  const attempt = await claimAttended();

  await rpc['attempt.closeOut']({ session: { attempt: attempt.id } /* the test client's fake `CallerProof` gives the attempt's caller */, closeOut: buildMockDesignCloseOut() });
  worker.failAlways('stop', { kind: 'unknown', reason: 'host_leased' });
  clock.advance(timeouts.closingGiveUpMinutes + 1);
  await tick();

  const settled = await readAttempt(attempt.id);

  expect(settled.state).toBe('succeeded'); // by its close-out, not by a forced reason
  expect(settled.strayedAt).not.toBeNull();
  expect(await heldSeats(attempt.id)).toEqual([]);
});

test('it sleeps a waiting attended session and wakes it with the same atc session', async () => {
  const { worker, clock, claimAttended, tick, readAttempt, heldSeats } = setupTest();
  const attempt = await claimAttended();

  worker.setSession(attempt.id, { state: 'running', attention: 'turn-ended', lastActivityAt: clock.now, agentSession: 'agent-session-1' });
  clock.advance(31);
  await tick();

  expect((await readAttempt(attempt.id)).state).toBe('sleeping');
  expect(await heldSeats(attempt.id)).toEqual([]);

  await rpc['item.wake']({ item: attempt.item });
  await tick(); // the claim takes the seats, then the runner resumes the session
  await tick(); // the reading confirms it

  expect((await readAttempt(attempt.id)).state).toBe('running');
  expect(await heldSeats(attempt.id)).toEqual(['workers', 'owner-design']);
  expect((await readAttempt(attempt.id)).atcSession).toBe(attempt.atcSession);
});

// An attended session that the owner attached to and left reads `working` for ever.
test('it sleeps an attended session that reads working with no activity for the quiet time', async () => {
  const { worker, clock, claimAttended, tick, readAttempt, heldSeats } = setupTest();
  const attempt = await claimAttended();

  worker.setSession(attempt.id, { state: 'running', attention: 'working', lastActivityAt: clock.now, agentSession: 'agent-session-1' });
  clock.advance(61);
  await tick();

  expect((await readAttempt(attempt.id)).state).toBe('sleeping');
  expect(await heldSeats(attempt.id)).toEqual([]); // `workers` and `owner-design` are both free
});

test('it settles the sleeping attempt of an item that the owner closes, with no wake', async () => {
  const { worker, claimAttended, sleep, readAttempt } = setupTest();
  const attempt = await sleep(await claimAttended());

  await rpc['item.close']({ item: attempt.item, reason: 'no longer wanted' });

  const settled = await readAttempt(attempt.id);

  expect([settled.state, settled.failure, settled.outcome]).toEqual(['failed', 'item-closed', 'lost']);
  expect(worker.calls.map((call) => call.method)).not.toContain('resume');
});

test('it settles a closing attempt as failed when the phase kind can no longer settle its close-out', async () => {
  const { worker, claimReview, tick, readAttempt, readItem, heldSeats, loadPhaseKinds } = setupTest();
  const attempt = await claimReview();

  await rpc['attempt.closeOut']({ session: { attempt: attempt.id } /* the test client's fake `CallerProof` gives the attempt's caller */, closeOut: toJSONValue(buildMockGateReading({ status: 'passed' })) }); // the test server's fake gate reads the body as its reading
  loadPhaseKinds([buildMockPhaseKind({ name: 'review', settle: () => { throw new Error('reading.status is not known'); } })]);
  worker.setSession(attempt.id, { state: 'suspended', asked: true, agentSession: null });
  await tick();

  const settled = await readAttempt(attempt.id);

  expect([settled.state, settled.failure, settled.outcome, settled.returnedOutcome]).toEqual(['failed', 'closeout-unsettleable', 'unsettleable', null]);
  expect(await heldSeats(attempt.id)).toEqual([]);
  expect((await readItem(attempt.item)).position).toMatchObject({ kind: 'hold', reason: 'outcome not in rules' });
});

test('it stops a session that appears after its item closed while the spawn was in flight', async () => {
  const { worker, claimAgent, tick, readAttempt } = setupTest();

  worker.failNext('start', { kind: 'unknown', reason: 'socket closed' });

  const attempt = await claimAgent(); // `reconciling`, no atc session id
  await rpc['item.close']({ item: attempt.item, reason: 'no longer wanted' });
  worker.setSession(attempt.id, { state: 'absent' });
  await tick();

  expect((await readAttempt(attempt.id)).state).toBe('closing'); // not settled: the spawn may still land

  worker.setSession(attempt.id, { state: 'running', attention: 'working', lastActivityAt: 0, lastOwnerAt: 0, agentSession: null });
  await tick(); // records the session id, sends `stop`; the fake's session becomes `suspended`
  await tick();

  expect(worker.calls.map((call) => call.method)).toContain('stop');
  expect([(await readAttempt(attempt.id)).state, (await readAttempt(attempt.id)).failure]).toEqual(['failed', 'item-closed']);
});

test('it sleeps an attended session whose agent stays active and whose owner is gone', async () => {
  const { worker, clock, claimAttended, tick, readAttempt, heldSeats } = setupTest();
  const attempt = await claimAttended();

  clock.advance(241);
  worker.setSession(attempt.id, { state: 'running', attention: 'working', lastActivityAt: clock.now - 60_000, lastOwnerAt: attempt.claimedAt, agentSession: 'agent-session-1' });
  await tick();

  expect((await readAttempt(attempt.id)).state).toBe('sleeping');
  expect(await heldSeats(attempt.id)).toEqual([]);
});

test('it ends the tick and reads every live attempt when the host refuses a wake for capacity', async () => {
  const { worker, claimAttended, claimAgent, sleep, tick, readAttempt, listFacts } = setupTest();
  const asleep = await sleep(await claimAttended());
  const other = await claimAgent();

  worker.setSession(other.id, { state: 'ended', agentSession: 'agent-session-2' });
  worker.failAlways('resume', { kind: 'refused', cause: 'capacity', reason: 'no free imp slot' });
  await rpc['item.wake']({ item: asleep.item });
  await tick(); // must return

  expect(worker.calls.filter((call) => call.method === 'resume')).toHaveLength(1); // one try in the tick
  expect((await readAttempt(asleep.id)).state).toBe('sleeping');
  expect((await readAttempt(asleep.id)).wakeRequestedAt).not.toBeNull();
  expect((await readAttempt(other.id)).state).toBe('failed'); // the reading of the other attempt ran: `ended` settles it
  expect(listFacts('boxxy.attempt.woken')).toHaveLength(1);

  await tick(); // inside the 60 seconds: no second try

  expect(worker.calls.filter((call) => call.method === 'resume')).toHaveLength(1);
});

// modules/dispatch/src/find-call-attempt.test.ts.
test('it refuses a call for the second attempt of a kept session while that attempt holds no caller', async () => {
  const { store, clock, newId, first, second } = await setupKeptSession({ secondCaller: null }); // the first attempt holds `caller`
  const caller = first.caller!;

  expect(await store.findSessionByCaller(caller)).toBeNull(); // the row of the first attempt does not count
  const answer = await closeOutAttempt({ store, call: { attempt: second.id, session: second.atcSession!, caller }, body: buildMockBuildCloseOut(), rules, now: clock.now, newId });

  expect(answer).toEqual({ kind: 'refused', reason: 'no-attempt' });
  expect((await store.readSnapshot(clock.now, rules)).facts).toHaveLength(0); // nothing written
});

test('it gives the second attempt of a kept session the caller of the first at the claim', async () => {
  const { second, first } = await setupKeptSession({}); // the claim through the resume edge
  expect(second.caller).toEqual(first.caller);
});

// modules/dispatch/src/close-out-attempt.test.ts.
test('it writes nothing when the close-out of the first attempt arrives again after its session was resumed', async () => {
  const { store, rules, clock, newId, claimBuild, settleBuilt, claimRework, readAttempt, listFacts } = setupTest();
  const first = await claimBuild();
  const body = buildMockBuildCloseOut();

  await closeOutAttempt({ store, call: { attempt: first.id, session: first.atcSession }, body, rules, now: clock.now, newId });
  await settleBuilt(first); // `built`: the session is kept
  const second = await claimRework(first.item); // review, `changes-requested`, then the claim through `resume: true`

  expect(second.atcSession).toBe(first.atcSession);

  // the same request again: it names the first attempt, and the edge resolved the same session
  const replay = await closeOutAttempt({ store, call: { attempt: first.id, session: first.atcSession }, body, rules, now: clock.now, newId });

  expect(replay).toStrictEqual({ kind: 'refused', reason: 'not-current' });

  // and a call from another session that names the second attempt
  const foreign = await closeOutAttempt({ store, call: { attempt: second.id, session: 'another-session' }, body, rules, now: clock.now, newId });

  expect(foreign.kind).toBe('refused');
  expect([(await readAttempt(second.id)).state, (await readAttempt(second.id)).closeOutHash]).toEqual(['running', null]);
  expect(listFacts('boxxy.attempt.closed_out')).toHaveLength(1);
});

test('it records a review close-out just under the size limit as a fact that fits one outbox item', async () => {
  const { store, clock, claimReview, readAttempt, listFacts } = setupTest();
  const attempt = await claimReview();
  const findingPaths = Array.from({ length: 500 }, (_, index) => `src/${index}/${'a'.repeat(200)}.ts`); // about 105,000 bytes as stored

  const answer = await rpc['attempt.closeOut']({ session: { attempt: attempt.id } /* the test client's fake `CallerProof` gives the attempt's caller */, closeOut: toJSONValue(buildMockGateReading({ status: 'blocked', why: 'open-findings', findingPaths })) });

  expect(answer.kind).toBe('recorded');
  expect((await readAttempt(attempt.id)).closeOut).toMatchObject({ reading: { findingPaths } });

  const [fact] = listFacts('boxxy.attempt.closed_out');

  expect(new TextEncoder().encode(JSON.stringify(toWireItem(fact))).length).toBeLessThan(outboxLimits.factBytes - outboxLimits.envelopeBytes);

  // and the fact reaches pepys: the sender stores it and parks nothing
  const sink = createFakeFactSink();

  expect(await runSenderOnce({ store, sink, clock, limits: outboxLimits })).toBe('stored');
  expect(sink.facts.map((sent) => sent.event)).toContain(fact.factId);
  expect((await store.read((tx) => tx.readOutboxCounts())).parked).toBe(0);
});

test('it rejects a close-out that is too large as stored, and leaves the attempt open', async () => {
  const { claimReview, readAttempt, listFacts } = setupTest();
  const attempt = await claimReview();
  const findingPaths = Array.from({ length: 32 }, () => '"'.repeat(1900)); // about 122,000 bytes as stored: each quote is 2 bytes of JSON

  const answer = await rpc['attempt.closeOut']({ session: { attempt: attempt.id } /* the test client's fake `CallerProof` gives the attempt's caller */, closeOut: toJSONValue(buildMockGateReading({ status: 'blocked', why: 'open-findings', findingPaths })) });

  expect(answer).toMatchObject({ kind: 'rejected', problems: [{ kind: 'too-large', max: 120_000 }] });
  expect((await readAttempt(attempt.id)).state).toBe('running');
  expect(listFacts('boxxy.attempt.closed_out')).toHaveLength(0);
});

// Pure.
test('it holds the item of an unsettleable attempt under rules that map the name its phase code returned', () => {
  // the settle stored `outcome: 'unsettleable'` and `returnedOutcome: 'approved'`; then a rollback
  const position = findPosition({
    pipeline: buildMockPipeline({ review: { on: { approved: 'next', 'changes-requested': { to: 'build', max: 3 } } } }),
    attempts: [{ phase: 'review', outcome: 'unsettleable', endedAt: 1000 }],
    retries: [],
  });

  expect(position).toMatchObject({ kind: 'hold', reason: 'outcome not in rules', then: 'review' });
});
