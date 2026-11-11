// Design sketch. It is not compiled.
//
// 03-flow.ts: how boxxy's core runs in v1. The functions that decide order, state and refusal
// have bodies. Every other function throws or is declared.
//
//   A. The attempt's states, its seats, and the one module that writes them.
//   B. The reconcile table: one table for every reading and every live state.
//   C. Sleep, wake, and how boxxy learns that the owner waits or returned.
//   D. The close-out, `closing`, the stop, the give-up rule, and settle.
//   E. The engine: `advance`, the fold `findPosition`, and what a rules change does.
//   F. The claim: round, input, mode. The rule for an attended design session.
//   G. Derived item state.
//   H. The kept session for rework, session cleanup, and notices.
//
// `atc:` marks a claim read in atc's code.

import type { AttemptChange, AttemptEvent, AttemptRow, AttemptState, CloseOutAnswer, Edge, HoldReason, Instant, Pipeline, PipelineStep, PhaseName, Position, ReadingAction, RetryLever, SessionReading, Settled, Settlement } from '@boxxy/model';
import { hashCanonical } from '@boxxy/content-hash';

// ── A. States, seats, and the one writer ───────────────────────────────────────────────────────
//
//   starting ─▶ running ─▶ sleeping ─▶ waking ─▶ running ─▶ closing ─▶ succeeded | failed
//   seats       seats      no seat     seats     seats      as held
//
//   Seats are taken at the claim, released at the sleep, taken again at the wake (inside the
//   claim, before the session resumes), and released at the settle. `closing` changes no seat: an
//   attempt keeps what it held until its session has stopped. The item-phase lease is held from
//   the claim to the settle, through every sleep.
//
// modules/dispatch/src/attempts/build-attempt-change.ts is the only code that builds a write to
// `attempts`, to `attempt_sessions`, or a seat write. The allowed moves:
//
//   event              allowed from                              to           writes besides the row
//   ─────────────────  ────────────────────────────────────────  ───────────  ──────────────────────────────────────
//   claimed            (no attempt)                              starting     lease, take-seats, decision; `claimed`, `decision.recorded`
//   started            starting, reconciling                     running      `started` or `reconciled`
//                      closing, cause `item-closed`, no session  (same)       records the atc session id; `started`
//   spawn-unanswered   starting                                  reconciling  `spawn_unanswered`
//   session-seen       any state                                 (same)       attempt_sessions row; `session_bound`
//   closed-out         every live state but closing              closing      clears the mark and the wake request; `closed_out`
//   timed-out          running, mode `agent`                     closing      `timed_out`
//   item-closed        starting, reconciling, running, waking    closing      clears the mark and the wake request; the fact is `boxxy.item.closed`
//   turn-ended         running, mode `agent`                     closing      `turn_ended`
//   stalled            running, mode `agent`                     closing      no fact of its own; `settled` carries the cause
//   skill-missing      starting, reconciling, running            closing      no fact of its own; `settled` carries the cause
//   suspend-asked      running, no mark                          (same)       the mark; no fact
//   suspend-refused    running, mark                             (same)       clears the mark and any wake request; no fact
//   slept              starting, reconciling, running            sleeping     release-seats, clears the mark; `slept`
//   wake-requested     sleeping with no request; running + mark  (same)       `wake_requested`
//   woken              sleeping                                  waking       holdGen + 1, take-seats, decision; `woken`, `decision.recorded`
//                                                                             with `overCap: true` the seats are taken past `max`
//   resumed            waking                                    running      `resumed`
//   wake-refused       waking                                    sleeping     release-seats; the attempt keeps its wake request; `slept`
//                                                                             `resumeClaim` then holds the attempt's pool back (section F),
//                                                                             so no claim of the same tick picks this wake again
//   settled            every live state                          succeeded    release-seats, lease release, effects; `settled`
//                                                                or failed
//   stray-stopped      succeeded or failed, with `strayedAt`     (same)       `sessionStoppedAt`; no fact
//
// The build follows this table in modules/dispatch/src/attempts/attempt-moves.ts, one data row per
// line above (`started` has one row per `via` and one for `closing`; `settled` one per end
// state). Four cells the table above leaves open, as built:
//   - `resumed` clears the wake request. Without it a woken attempt keeps its request, and its
//     next sleep reads as a sleep with a wake already asked for.
//   - `wake-refused` writes `slept` with `idleSince` the earlier `sleptAt` and `asked: true`.
//   - `item-closed` builds no fact: the change of `item.close` writes `boxxy.item.closed`, which
//     lists each attempt it ended.
//   - `settled` builds the attempt's own writes and the `settled` fact. The event carries the
//     fact's `criteria`, `matched`, `frictionDropped` and `skippedEffects`; `settleAttempt` adds
//     the writes and facts of the effect plans to the same store change.
//
// The race guard. Each change of a live attempt carries `under: { item, phase, gen: leaseGen,
// holdGen }`. Its update of the attempt row `expect`s every column the machine's context reads
// (`AttemptGuard`: state, holdGen, the suspend mark, the wake request, closing, atcSession,
// strayedAt, sessionStoppedAt), as the builder read them. So two callers that race on one row
// get one `applied` and one `stale-generation` or `guard-mismatch`, also for two moves that keep
// the state (two `suspend-asked`, two `wake-requested`, two `stray-stopped`). A caller drops a
// refused change and reads again on the next tick. Two kinds of change carry no `under`: the
// claim, which takes the lease (`lease-held` guards it), and a move of a settled attempt
// (`session-seen`, `stray-stopped`), whose lease is released. `session-seen` writes no attempt
// column, so it carries no `expect`; the unique key of `attempt_sessions` guards it.
//
// The table above is an XState machine, `xstate@6.0.0-beta.2`, pinned exactly (no version
// range). modules/dispatch/src/attempts/attempt-machine.ts builds it from the table of moves,
// and `buildAttemptChange` is its only caller. The reconcile table of section B is a plain
// function, not a machine.
//   - No actor is created. `buildAttemptChange` calls the pure `transition` function. Each move
//     emits one `{ type: 'effect', effect }` event per write or fact (`enq.emit`), and the
//     builder reads them from the answer as data. `isUnhandled` on that answer gives
//     `not-allowed`.
//   - `claimed` is the initial transition (`initialTransition`; the root `entry` emits its
//     effects), so the machine lists no `claimed` event.
//   - The row stores the state value (`AttemptRow.state`) and the context, never a snapshot.
//     `machine.resolveState({ value, context })` builds the snapshot from the row on each call.
//     XState's `restoreMachineSnapshot` is internal and is not used.
//   - `succeeded` and `failed` are plain states, not `type: 'final'`. A final state drops every
//     later event, and `session-seen` and `stray-stopped` are allowed there.
//   - The context is what the guards read, each field from one row column:
//       mark            `suspendRequestedAt` is set
//       wakeRequested   `wakeRequestedAt` is set
//       mode, holdGen   the same columns
//       closing         the `closing` column; the `started` row for `closing` reads it
//       hasSession      `atcSession` is set; the same row reads it
//       strayed         `strayedAt` is set; `stray-stopped` reads it
//       sessionStopped  `sessionStoppedAt` is set; `stray-stopped` reads and sets it
//     The table needs all of them, the last four included. The builder writes a context change
//     back to its column (a set flag writes `now`, a cleared one null).
//   - v6 has no `guard` key: a guard is an `if` inside the transition function, and it returns
//     before any `enq` call, because XState takes any queued effect as a taken transition.
//   - Every state's `on` lists all 18 events, and a handler with no matching row returns
//     `undefined` (unhandled). tsgo refuses an `on` object whose keys are optional.
//   - The machine's events use the field `type`, which XState needs. `AttemptEvent` uses
//     `kind`, and `buildAttemptChange` maps one to the other.
//   - `woken` carries the field `overCap`.
//   - A spawn refused for capacity has no event and no state: it is `settled` from `starting`.
//   - `hasSession` is about the atc session ID. The agent session ID of the no-sleep rule is
//     not in the context: the reconcile table holds that rule (section B, note 8).
//   - `stalled`, `skill-missing` and `wake-refused` are events of the machine. Each is one
//     transition between states of the diagram above; none adds a state. The machine has 8
//     states.
//   - The kept session is NOT in the machine. It is state of the item, between two attempts
//     (section H). The machine of the second attempt sees a plain `started`.
//   - Tests. A path set generated with `xstate/graph` (`getShortestPaths`) proves that every
//     one of the 8 states is reached, in each mode; `holdGen` is left out of `serializeState`
//     there. The paths prove states, not every transition, so one direct test covers
//     `stray-stopped`, and the builder's tests have one case per row and per state it is
//     allowed from.
//   - The machine typechecks under the repo's tsgo build (`tsrs`).

export function buildAttemptChange(input: { attempt: AttemptRow | null; event: AttemptEvent; actor: ActorRef; now: Instant; newId: () => string }): AttemptChange {
  throw new Error('not implemented'); // the table above
}

// ── B. The reconcile table (modules/dispatch/src/pick-reading-action.ts) ───────────────────────
//
// This is the only table for a reading. The build removes the runner table of
// docs/design/boxxy/slice-1.md from the existing code and follows this one. `mark` is
// `suspendRequestedAt !== null`. `waits` is `readWaitingSince(attempt, reading) !== null`.
//
//   reading \ state   starting,       running                      sleeping            waking           closing
//                     reconciling
//   ────────────────  ──────────────  ───────────────────────────  ──────────────────  ───────────────  ─────────────────
//   running           move-to-        mark: clear-mark             no request:         move-to-running  stop (2), or
//                     running         agent mode, past the         request-wake        (resume)         give-up settle (3)
//                                       timeout: close (timed-out) else, 2 ticks on:
//                                     agent mode, turn-ended:      wake-over-cap (1)
//                                       close (turn-ended)
//                                     waits: sleep-if-idle (8)
//                                     else: bind-only
//   suspended         sleep (4)       sleep (4)                    nothing             resume (5)       settle
//   ended             settle          mark: sleep; else settle     nothing             resume (5)       settle
//   absent            respawn (6)     settle, session-lost         settle,             settle,          settle (7)
//                                                                  session-lost        session-lost
//
//   (1) The session runs while its attempt holds no seat: the owner revived it in atc. The first
//       such reading writes the wake request, and the next claim seats the attempt when a seat is
//       free. When the attempt still sleeps `timeouts.seatlessTicks` later, no seat was free.
//       boxxy does not stop the session. The attempt wakes over the cap (`woken` with
//       `overCap: true`), the limit counts it, and `claimNext` starts no new work in that pool
//       until the count is back at or under the max.
//   (2) Not while the agent is inside a turn, until `timeouts.stopGraceSeconds` after `closingAt`,
//       so the agent can tell the owner that the close-out went in.
//   (3) `timeouts.closingGiveUp` after `closingAt`: section D.
//   (4) Releases the seats. With `asked: false` and no mark, it also writes a wake request
//       (`host-slept-unasked`), so a host that slept across a restart of atc comes back alone.
//   (5) Calls `resumeClaim` again. `timeouts.resumeLost` after `wokenAt`: settle, `resume-lost`.
//   (6) Sends the stored spawn request again. `timeouts.spawnLost` after the claim: settle,
//       `spawn-lost`.
//   (7) Not for an attempt that entered `closing` before any session was seen (cause
//       `item-closed`, `atcSession` null): its spawn may still land. That attempt gives
//       `await-spawn`: no respawn and no settle. See section D.
//   (8) boxxy never puts an attempt to sleep before atc reports an agent session
//       ID for it. atc cannot revive a session that was stopped before atc captured that ID.
//       So `sleep-if-idle` and `sleep-unattended` are given only when the reading's
//       `agentSession` is not null. Until then the cell gives `bind-only`. Cell (4) is not
//       boxxy's own sleep: the host slept with no request. An attempt whose host slept before
//       atc captured the ID settles as `resume-lost` on its wake.
//   (9) The stall rule, a cell of `running` × `running`, agent mode only. The
//       reading's `lastActivityAt` is `timeouts.stallMinutes` (30) old: close (stalled). The
//       runner stops the session and the attempt settles as `failed`, `stalled`, which counts
//       against `maxAttempts`. It is checked after the step timeout and before `bind-only`, and
//       whatever the attention is. It does not apply to attended mode: such a session sleeps
//       (the quiet rule). It is the floor under the step timeout, which can be hours.
//
// A `running` attempt whose session reads `running` is
// `bind-only` only inside a bound that the rules set. The bounds, by mode:
//   agent     `step.timeoutMinutes`, which every step must set. Past it: close (timed-out), stop,
//             settle as `failed`, `timed-out`. The settle frees the `workers` seat.
//   attended  `waits` is also true when the reading is `working` and `lastActivityAt` is
//             `sleep.afterQuietMinutes` old. Then: sleep-if-idle, which sleeps at once, because the
//             quiet time is at or above the idle time. The sleep frees the `workers` seat and the
//             `owner-design` seat. The attempt keeps its lease and wakes as any sleeping attempt.
//   attended  The agent stays active (a long task; trail events every few minutes), so
//             the quiet rule never fires. Then the bound is `sleep.afterUnattendedMinutes`,
//             counted from the latest of `startedAt`, `wokenAt` and the reading's `lastOwnerAt`.
//             Past it: `sleep-unattended`, a sleep with no idle check (the mark, then
//             `worker.suspend(attempt, null)`, then `slept`). It frees both seats, as above. It is
//             a sleep, never a close: the work is kept, and the owner wakes it.
//   What is not bounded, on purpose: an attended session that the owner attaches to again
//   inside every `afterUnattendedMinutes`. The owner is there, and the seat is in use.
//   An owner who stays attached for longer than the bound without a new attach is put to sleep
//   once; a revive in atc or `boxxy item wake` brings the session back and restarts the count.
// A `closing` attempt with the cause `item-closed` is stopped with no grace time.
//
// Three rules that the table holds:
//   - A `running` reading never settles. atc's `done` maps to `running` with attention
//     `turn-ended`; an end is only `suspended` (after a stop), `ended` or `absent`.
//   - `ended` on a `sleeping` attempt does nothing. A local session that boxxy put to sleep
//     reads `ended`. A session that truly ended while asleep shows at the wake: the resume fails,
//     and the attempt settles as `resume-lost`.
//   - `closing` beats the mark. A close-out that lands between the mark and the stop moves the
//     attempt to `closing` and clears the mark; the stop that follows is then the closing's stop.

export function pickReadingAction(input: { attempt: AttemptRow; reading: SessionReading; step: PipelineStep | null; sleep: { afterIdleMinutes: number; afterQuietMinutes: number; afterUnattendedMinutes: number /* the third sleep time, as 02-types.ts has it */ }; now: Instant }): ReadingAction {
  throw new Error('not implemented'); // the table above
}

// ── C. Sleep and wake ──────────────────────────────────────────────────────────────────────────
//
// "The session waits for the owner", from the reading alone (atc has no such signal):
//
//   attention `needs-input`                             every mode: since `lastActivityAt`
//   attention `turn-ended`, mode `attended`             since `lastActivityAt`
//   a woken session with no activity after `wokenAt`    since `wokenAt` (atc lists a revived session as `running`)
//   attention `working`, mode `attended`, and           since `lastActivityAt` (the quiet rule)
//     `lastActivityAt` is `sleep.afterQuietMinutes` old
//   anything else                                       it does not wait
//
// Why the quiet rule: an attach moves an atc session from `needs_you` to `running`, so a
// prompt that the owner looked at and left reads `working` with no later activity. The rule
// cannot tell that from one tool call that runs longer than the quiet time with no trail event.
// On a target whose host can sleep the turn is kept inside the host; on a local target it is lost.
//
// `lastActivityAt` is the later of atc's last trail event and the owner's last attach.
// atc: an attach sets `lastAttachedAt`. packages/daemon/src/sessions/create-session-manager.ts:608.
//
// The sleep, when the wait is `rules.sleep.afterIdleMinutes` old. Three steps; the seats go last.
// None of the three runs before atc reports an agent session ID for the attempt
// (section B, note 8).
//   1. `suspend-asked`: the mark, in one change, before any worker call.
//   2. `worker.suspend(attempt, waitingSince)`, outside the lock. The adapter reads the session
//      again and refuses with `active` when it has newer activity (on that test alone,
//      whatever atc's state says). atc's stop takes no guard, so a prompt the owner submits
//      between that read and the stop is cut off.
//   3. `suspended`: `slept` (release-seats). `refused`: `suspend-refused`. `unknown`: keep the
//      mark; the next reading decides (`running` clears it, `suspended` or `ended` sleeps).
//
// The wake is ONE mechanism. Every source below ends in `requestWake`; nothing
// else wakes an attempt. An optional atc hook on the owner's attach that runs `boxxy item wake`
// is source a again, not a fourth path.
// "The owner returned". atc sends boxxy nothing, so boxxy has three sources, all of which end in
// `requestWake` and the event `wake-requested`:
//   a. `boxxy item wake <item>` (procedure `item.wake`).
//   b. A reading: the session runs while the attempt sleeps (cell (1) above).
//   c. A reading: the host slept with no request (cell (4) above).
// The order of a wake: `decide` puts the wake first, `claimNext` applies `woken` (holdGen + 1,
// take-seats), and only then `resumeClaim` calls `worker.resume`. This sketch does not show
// `decide` or the take SQL of `claimNext`; the build designs them.
// One case leaves that order. The owner revived the session in atc and no seat
// came free in `timeouts.seatlessTicks`: `actOnReading` applies `woken` with `overCap: true`
// (`wake-over-cap`). The session already runs, so no `worker.resume` call follows; the next
// reading gives `move-to-running`. The limit counts the seat, so it can read `held` above `max`.
// The `woken` fact then carries `overCap: true`, and the decision row records the limit's count
// and `max` at that moment.
//
// This sketch does not list the crash windows of the sleep's three steps (a crash between the
// mark, the worker call and `slept`). The build works them out.

// ── D. Close-out, closing, stop, give-up, settle ───────────────────────────────────────────────
//
// modules/dispatch/src/close-out-attempt.ts. One row per case:
//
//   case                                               answer                       writes
//   any body, for an attempt that is not the CURRENT   refused: not-current         nothing   checked first
//     attempt of the calling session
//   first valid close-out, attempt live, not closing   recorded, repeat: false      event `closed-out`
//   invalid close-out, attempt live, not closing       rejected, every problem      nothing
//   a valid close-out over `closeOutBytes` as stored   rejected, `too-large`        nothing
//   the same body again, any state                     recorded, repeat: true       nothing
//   a different body, closing by its close-out         refused: already-closed-out  nothing
//   any body, closing by any other cause (timeout,     refused: not-current         nothing
//     turn end, item close, stall, missing skill)
//   any other body, attempt settled                    refused: not-current         nothing
//   a session boxxy never started, or not bound yet    refused: no-attempt          nothing
//
// The rule for a call from inside a session: it reaches the attempt that the request NAMES, and
// only when that attempt is the CURRENT attempt of the calling session.
//   - The request carries the attempt ID that the session read with `attempt.current`. That
//     read takes no input: the edge answers it with the latest attempt of the calling session.
//     It is how a session, fresh or kept, learns its attempt ID; no env value and no message
//     text carries one. A kept session reads it again after its resume and gets the new ID.
//   - The edge proves WHO calls (its `CallerProof` port, ../edge/01-api.ts) and passes the
//     proven `CallerIdentity` and the atc session it found for it. No secret per attempt.
//   - The core checks them in `findCallAttempt`, below. "Current" is: the attempt's
//     `atcSession` is the calling session, AND the attempt is the latest one that session carries.
//   - AND the current attempt's OWN `caller` equals the proven caller. A null `caller` on the
//     current attempt is a refusal, with no write (`findCallAttempt` answers `no-attempt` for
//     a caller that does not match). A match against any attempt row of the session is not
//     enough: a kept session whose first attempt holds a caller and whose second holds none
//     would then get a write on the second.
//   - Any other attempt ID is `refused: not-current`, and nothing is written: not to the named attempt
//     and not to the one the session carries at that time. That covers an older attempt of a
//     kept session, an attempt of another session, and a made-up ID. The core never moves from
//     the named attempt to the latest one.
//   - The check is the first one, before the repeat check, so the answer does not depend on the
//     body. The same-body repeat rule (`recorded, repeat: true`) applies only within ONE attempt:
//     the current one. A settled attempt that is still the latest of its session keeps that
//     repeat answer, and any other body gets `not-current`.
//   - `closeOutAttempt`, `attempt.evidence`, the pull request link and `attempt.bindSession`
//     (the session-start hook) all go through `findCallAttempt`. `attempt.current` does not: it
//     names no attempt and writes nothing. A session that still holds the ID of its first
//     attempt (it did not read `attempt.current` again) gets `not-current` on every write.
//   - Why the request names the attempt: `tx.findAttemptBySession` gives the LATEST attempt of
//     a kept session, and the second attempt has no close-out hash. A call routed to the latest
//     attempt would take the first attempt's request, sent again after the session was resumed,
//     as the second attempt's first close-out.
//
// The size rule. The limit is on the close-out AS STORED: the UTF-8 bytes of the JSON of
// `parsed.closeOut`, which is what the `closed_out` fact carries. The bytes of the request do
// not bound it: JSON.parse then JSON.stringify makes `1e20` 21 bytes long. A close-out over
// `closeOutLimits.closeOutBytes` (120,000) is `rejected` with the problem `too-large`, as any
// invalid close-out: nothing is written, the attempt is still open, and the agent sends a
// shorter one. So an accepted close-out always fits one outbox item (`factBytes`, 262,144; the
// numbers are in 02-types.ts, `closeOutLimits`).

// modules/dispatch/src/attempts/find-call-attempt.ts (a file the build adds). The one check of
// every call from inside a session. It reads inside the caller's lock. `session` is what the
// edge resolved from the caller's identity, never a value from the request body.
export async function findCallAttempt(tx: StoreReader, call: CallRef): Promise<{ kind: 'attempt'; attempt: AttemptRow } | { kind: 'refused'; reason: 'no-attempt' | 'not-current' }> {
  // the session carries no attempt at all: boxxy never started it, or the start is not recorded yet
  const latest = await tx.findAttemptBySession(call.session);

  if (latest === null) {
    return { kind: 'refused', reason: 'no-attempt' };
  }

  // The named attempt must be that latest one. An ID with no row, an attempt of another
  // session, and an older attempt of this kept session all fail here. `findAttemptBySession`
  // is used to compare, never to pick the attempt that the call goes to.
  if (latest.id !== call.attempt) {
    return { kind: 'refused', reason: 'not-current' };
  }

  // The CURRENT attempt must itself hold the proven caller. A row with
  // no caller, and a row with another caller, are refused. An older row of the session is never
  // read for this.
  if (!isSameCaller(latest.caller, call.caller)) {
    return { kind: 'refused', reason: 'no-attempt' };
  }

  return { kind: 'attempt', attempt: latest };
}

// False when either side is null.
declare function isSameCaller(recorded: CallerIdentity | null, proven: CallerIdentity): boolean;

// What `attempt.current` reads. It names no attempt, so it cannot use
// `findCallAttempt`; it makes the same caller check on the latest attempt of the session.
export async function findCurrentAttempt(tx: StoreReader, call: Omit<CallRef, 'attempt'>): Promise<AttemptRow | null> {
  const latest = await tx.findAttemptBySession(call.session);

  return latest !== null && isSameCaller(latest.caller, call.caller) ? latest : null;
}

export function closeOutAttempt(input: CloseOutInput): Promise<CloseOutAnswer> {
  return input.store.exclusive(async (tx) => {
    // The named attempt, checked against the calling session, inside the lock. Never the latest
    // attempt of the session whatever the request is for.
    const found = await findCallAttempt(tx, input.call);

    if (found.kind === 'refused') {
      return found;
    }

    const attempt = found.attempt;

    const hash = hashCanonical(input.body); // the body only: the phase is the attempt's

    if (attempt.closeOutHash === hash && attempt.closeOutFact !== null) {
      return { kind: 'recorded', attempt: attempt.id, factId: attempt.closeOutFact, repeat: true };
    }

    if (attempt.state === 'closing' || attempt.state === 'succeeded' || attempt.state === 'failed') {
      return { kind: 'refused', reason: attempt.state === 'closing' && attempt.closing === 'closed-out' ? 'already-closed-out' : 'not-current' };
    }

    // The parser is the attempt's phase kind's. The agent sends no phase.
    const snapshot = await tx.readSnapshot(input.now, input.rules);
    const parsed = getPhase(input.rules, attempt.phase).closeOut.parse(input.body, await buildCloseOutContext(tx, attempt, snapshot, input.rules));

    if (parsed.kind === 'invalid') {
      return { kind: 'rejected', problems: parsed.problems };
    }

    // The close-out as the fact will carry it, after the parser cut the noslop report of a
    // review close-out (02-types.ts, `NoslopSummary`). `hash` is the hash of the
    // body as sent, so a repeat of a body that the parser cut is still a repeat.
    const bytes = measureJsonBytes(parsed.closeOut);

    if (bytes > closeOutLimits.closeOutBytes) {
      return { kind: 'rejected', problems: [{ kind: 'too-large', bytes, max: closeOutLimits.closeOutBytes }] };
    }

    const built = buildAttemptChange({ attempt, event: { kind: 'closed-out', closeOut: parsed.closeOut, hash }, now: input.now, newId: input.newId });

    if (built.kind === 'not-allowed') {
      return { kind: 'refused', reason: 'not-current' };
    }

    const result = await tx.applyChange(built.change);

    return result.kind === 'applied' ? { kind: 'recorded', attempt: attempt.id, factId: readClosedOutFact(built.change), repeat: false } : { kind: 'refused', reason: 'not-current' };
  });
}

// The stop. `worker.stop` is atc's `session.kill { stopOnly: true }`, the same call as a sleep.
// atc: on a target whose host can sleep, that call sleeps the host and the session then lists
//      `exited` with harness `suspended`; on any other target it ends the process.
//      packages/daemon/src/sessions/create-session-killer.ts:95-161.
// atc: a host that refuses to sleep makes the call throw before anything changes (same file,
//      `stopHarness`). So a stop can fail for as long as another owner keeps the host awake.
// So a `closing` attempt ends on `suspended`, `ended` or `absent`. The settle itself deletes no
// session and no host. After the settle, cleanup forgets the stopped session (section H).
//
// The give-up rule. A `closing` attempt whose session still reads `running`
// `timeouts.closingGiveUp` (10 minutes) after `closingAt` settles anyway:
//   - by its cause, as any other closing attempt (a closed-out one by its close-out);
//   - with `sessionStopped: false`, which sets `strayedAt` and is on the `settled` fact;
//   - its seats and its lease are released, so the item and the limit are not held for ever.
// An item closed while its attempt's spawn is in flight. The attempt is `starting` or
// `reconciling` with no atc session id, and `item.close` moves it to `closing`. For such an
// attempt an `absent` reading does not mean the session is gone: atc may not have answered yet.
//   - `absent`: `await-spawn`. The attempt remains `closing` with its seats. boxxy sends no second
//     spawn request.
//   - the session appears (`running`, by its spawn name, or a late `started` answer): the event
//     `started` records its id, and the `closing` column stops it, with no grace. Then settle.
//   - still `absent` at `timeouts.spawnLost` after the claim: settle as `failed`, `item-closed`,
//     with `sessionStopped: false`. That sets `strayedAt`. The stray loop below then reads the
//     session by its spawn name for `timeouts.strayHours`, stops one that appears late, and
//     `runner.status` lists the attempt as a stray until then.
// So no path settles such an attempt without either a stop sent or the stray mark set.
//
// The session may still run. The runner keeps sending `stop` to each stray session every tick for
// `timeouts.strayHours`, writes `stray-stopped` when a reading shows it stopped, and
// `runner.status` lists every stray session. Until then one more session than `workers.max` can
// run. The alternative holds the seat and the lease until someone stops the session by hand.

// `item.close` ends the item's live attempts (modules/dispatch/src/attempts/end-item-attempts.ts).
// The procedure reads the item's live attempts in its own `exclusive` call and puts
// `endItemAttempts`' writes in the same change as the item's close:
//
//   attempt state                           what the close does                      the session in atc
//   ──────────────────────────────────────  ───────────────────────────────────────  ─────────────────────────────────
//   sleeping                                event `settled`, in that change:         already stopped, with its host
//                                           `failed`, `item-closed`, outcome `lost`, asleep (imp) or its process ended
//                                           the lease released. No wake, no seat.    (local). It is listed in atc until
//                                                                                    cleanup forgets it (section H).
//   starting, reconciling, running, waking  event `item-closed`: ─▶ `closing`.       the runner sends `stop` on the
//                                           It keeps its seats until the stop.       next tick, with no grace time;
//                                           Then settle: `failed`, `item-closed`.    then as above. No session yet
//                                                                                    (`absent`): `await-spawn`, by the
//                                                                                    spawn-in-flight rule above.
//   closing                                 nothing. It settles by its own cause.    as its cause says
//
//   - The close itself deletes no session and no host. The attempt settles as `failed`, so
//     cleanup forgets its stopped session `timeouts.failedSessionHours` later (section H). The
//     item's kept session, if any, is forgotten at the close.
//   - A session that does not stop goes through the give-up rule above, like any closing attempt.
//   - The `close-item` effect of a triage settle uses the same builder. The settling attempt is
//     the item's only live attempt (an item stands at one phase), so it ends nothing else.
//     Under the v1 rules no triage settle runs it. `declined` and `duplicate` map
//     to a `hold` edge, and `settleAttempt` withholds each effect that changes an item.
//     The effect runs only under rules that map such an outcome to `{ end: … }`.
//   - The item is archived, so the `lost` outcome moves nothing.
//
// modules/dispatch/src/settle-attempt.ts. One `exclusive` call, one change.
// No step of it throws on stored data. Only a store error (such as SQLITE_BUSY) leaves
// it, and the next tick tries again. The give-up rule calls this same function.
export function settleAttempt(input: SettleAttemptInput): Promise<ApplyResult> {
  return input.store.exclusive(async (tx) => {
    const attempt = await tx.readAttempt(input.attempt);
    const snapshot = await tx.readSnapshot(input.now, input.rules);
    const item = findItem(snapshot, attempt.item);

    // 1. An attempt that ends with no close-out, or with a forced reason, has one outcome,
    //    decided here and in no phase file. Else the phase kind's settle rule runs.
    //    `forced` is `item-closed` for an attempt that closed with that cause.
    // 2. The stored close-out was valid for the phase kind loaded when it arrived. The
    //    kind loaded now may differ (a restart with new phase code). So `settle` runs inside a
    //    catch, and its outcome is checked, not asserted:
    //      it throws, or the rules do not have the phase      failed, `closeout-unsettleable`, outcome `unsettleable`
    //      it returns an outcome its kind does not list       failed, `closeout-unsettleable`, outcome `unsettleable`;
    //                                                         the returned name goes to `returnedOutcome`
    //    Neither applies an effect. The close-out is kept on the row. `advance` finds no edge for
    //    the stored outcome and holds the item with `outcome not in rules`, so the owner sees it,
    //    and `item retry --phase` moves the item on.
    const settlement: Settlement =
      attempt.closeOut === null || input.forced !== null
        ? { state: 'failed', failure: input.forced ?? 'closeout-missing', outcome: 'lost', effects: [], frictionDropped: 0 }
        : trySettle(input.rules, { attempt, item, closeOut: attempt.closeOut, now: input.now });
    const returnedOutcome = readReturnedOutcome(settlement); // null unless `trySettle` set it

    // 3. Plan each effect with its handler. This sketch does not show the effect handlers; the
    //    build designs them. A refused effect is skipped and listed. So is one whose handler
    //    throws.
    //    When the rules map this outcome to a `{ hold: reason }` edge, the item holds for the
    //    owner, and the close-out is kept on the row. This is the one place where settle reads
    //    an edge; it stores no position.
    //    The hold withholds every effect that CHANGES AN ITEM:
    //    `close-item`, the relations, and `set` (kind, design mode, acceptance). Friction still
    //    records (`record-proposal`), because it is a fact about the attempt only.
    const held = isHoldEdge(findEdge(input.rules, item, attempt.phase, settlement.outcome));
    const plans = settlement.effects
      .filter((effect) => !held || !changesItem(effect))
      .map((effect) => tryPlanEffect(effect, { attempt, item, snapshot, rules: input.rules, now: input.now, newId: input.newId }));

    // 4. One change: state, failure, OUTCOME, endedAt, release-seats, the lease release, the
    //    effects' rows and facts, and `boxxy.attempt.settled`. The change holds no next phase:
    //    nothing calls `advance` here. The item's position is read, not written.
    const built = buildAttemptChange({ attempt, event: { kind: 'settled', settlement, returnedOutcome, plans, sessionStopped: input.sessionStopped }, now: input.now, newId: input.newId });

    return built.kind === 'change' ? tx.applyChange(built.change) : { kind: 'guard-mismatch', table: 'attempts', key: { id: attempt.id } };
  });
}

// Never throws.
// The stored outcome is ALWAYS the fixed name `unsettleable`. A name that the phase code
// returned and its kind does not list is kept apart, as `returned`, and reaches only the row's
// `returnedOutcome` and the fact. If that name were the stored outcome, a rollback to rules
// that map it (`approved: next`) would move the item on with no effect applied.
function trySettle(rules: LoadedRules, input: SettleInput<CloseOut>): Settlement & { returned?: string } {
  const unsettleable = (returned?: string): Settlement & { returned?: string } => ({ state: 'failed', failure: 'closeout-unsettleable', outcome: 'unsettleable', returned, effects: [], frictionDropped: 0 });
  const phase = rules.phases.get(input.attempt.phase);

  if (phase === undefined) {
    return unsettleable();
  }

  try {
    const settlement = phase.settle(input);

    return phase.outcomes.includes(settlement.outcome) ? settlement : unsettleable(settlement.outcome);
  } catch {
    return unsettleable(); // the server logs the error with the attempt id
  }
}

// ── E. The engine (libs/model/src/pipeline/advance.ts and find-position.ts; pure; the build adds both) ──

export function advance(input: { pipeline: Pipeline; settled: Settled; counted: readonly Settled[]; round: number }): Position {
  const step = findStep(input.pipeline, input.settled.phase);
  const round = input.round;

  // `lost` is the engine's own outcome: the attempt ended with no valid close-out.
  // `unsettleable` has no entry in `on` under ANY rules file, old or new: the
  // loader refuses a phase kind that lists an engine outcome, and `on` may name only listed
  // outcomes. So it always reaches the hold below. Only `item retry --phase` moves the item on.
  const edge: Edge | undefined = input.settled.outcome === 'lost' ? 'again' : step.on[input.settled.outcome];

  // An outcome the current rules do not map. The loader refuses a rules file that leaves out an
  // outcome of a phase kind, so this is an attempt that settled under older rules or an older
  // phase kind. It never reads as `next`: the item holds, and the owner sees why.
  if (edge === undefined) {
    return { kind: 'hold', reason: 'outcome not in rules', then: step.phase, round };
  }

  if (edge === 'next') {
    const following = input.pipeline.steps[input.pipeline.steps.indexOf(step) + 1];

    return following === undefined ? { kind: 'end', reason: 'pipeline-done' } : { kind: 'phase', phase: following.phase, round };
  }

  if (edge === 'again') {
    // attempts at the tail of `counted`, this one included, that also ran this phase again
    const inARow = 1 + countTrailing(input.counted, (earlier) => earlier.outcome === 'lost' || findStep(input.pipeline, earlier.phase)?.on[earlier.outcome] === 'again');

    return inARow >= step.maxAttempts ? { kind: 'hold', reason: 'attempts used up', then: step.phase, round } : { kind: 'phase', phase: step.phase, round };
  }

  if ('end' in edge) {
    return { kind: 'end', reason: edge.end };
  }

  // A `{ hold: reason }` edge. The item holds for the owner with the rules' reason
  // (`declined`, `duplicate`). `then` is the step's own phase, so `boxxy item retry <item>`
  // sends the item back to that phase (triage), with the counts reset and the round kept.
  // `boxxy item close <item>` confirms the close-out's result. No effect that changes an item
  // ran. The owner reads the agent's result (declined with its reason, or
  // duplicate with the other item) from the hold reason and from the attempt's close-out in
  // `item.get`, and then confirms or rejects it.
  if ('hold' in edge) {
    return { kind: 'hold', reason: edge.hold as HoldReason, then: step.phase, round };
  }

  // The loop and its stop. With `changes-requested: { to: build, max: 3 }`, the fourth review
  // that requests changes holds the item, and the round does not rise.
  const taken = 1 + input.counted.filter((earlier) => earlier.phase === step.phase && earlier.outcome === input.settled.outcome).length;

  return edge.max !== undefined && taken > edge.max
    ? { kind: 'hold', reason: 'rounds used up', then: edge.to, round }
    : { kind: 'phase', phase: edge.to, round: round + 1 };
}

export function findPosition(input: { pipeline: Pipeline | null; attempts: readonly Settled[]; retries: readonly RetryLever[] }): Position {
  const first = input.pipeline?.steps[0];

  if (input.pipeline === null || first === undefined) {
    return { kind: 'end', reason: 'no-pipeline' };
  }

  let position: Position = { kind: 'phase', phase: first.phase, round: 1 };
  let counted: Settled[] = [];
  let round = 1; // the item's round; only a `to` edge and a `retry --phase` raise it

  // the settled attempts and the retry levers, in time order
  for (const event of mergeByTime(input.attempts, input.retries)) {
    if (event.kind === 'retry') {
      // lifts a hold, resets both caps, and may name the phase. It never lowers the round.
      counted = [];

      const phase = event.lever.phase ?? (position.kind === 'end' ? null : position.kind === 'hold' ? position.then : position.phase);

      if (phase !== null && findStep(input.pipeline, phase) !== undefined) {
        // a lifted `rounds used up` hold and a named phase both start a new round
        round += event.lever.phase !== null || (position.kind === 'hold' && position.reason === 'rounds used up') ? 1 : 0;
        position = { kind: 'phase', phase, round };
      }

      continue;
    }

    // An attempt that failed with `no-capacity` is not an attempt of work. It does not move the
    // item and it is not counted against `maxAttempts`. `usage-limit` is skipped the same way.
    if (event.settled.failure === 'no-capacity' || event.settled.failure === 'usage-limit') {
      continue;
    }

    // An attempt of a phase that the item's pipeline does not have does not move the item.
    if (findStep(input.pipeline, event.settled.phase) === undefined) {
      continue;
    }

    position = advance({ pipeline: input.pipeline, settled: event.settled, counted, round });
    round = position.kind === 'end' ? round : position.round;
    counted.push(event.settled);
  }

  return position;
}

// What a rules change does to an item in flight. The position is computed on every read from the
// stored outcomes and the rules loaded now, so:
//
//   - A live attempt is not touched. It keeps its phase, its recipe hash and its rules version,
//     and it settles by the phase kind loaded when it settles.
//   - An item between attempts stands where the NEW rules put it:
//       an edge changed (`passed: { end: reviewed }` becomes `next`)   the item moves on to the new target
//       `max` or `maxAttempts` raised                                  a held item becomes ready again
//       `max` or `maxAttempts` lowered                                 an item can become held
//       a step added after the item's latest settled phase             the item runs it
//       a step added before it                                         the item does not go back
//       a step removed                                                 its attempts are skipped; the item stands
//                                                                      after the latest attempt of a phase that remains
//       an outcome that its phase kind does not list                   the item holds, `outcome not in rules`
//       a `hold` edge becomes `{ end: … }`                             the item ends; the skipped effects
//                                                                      (such as `close-item`) do not run late
//   - An item whose kind changed (triage's `set-kind`) folds over the new kind's pipeline by the
//     same rule: a pipeline with a `triage` step goes on from it, and one with none starts at its
//     first step. `advance` has no special case for a kind change.
//   - The rules dry run shows these moves before a rules change merges.
//     `dryRunRules` (02-types.ts) folds `findPosition` over each open item twice, with the rules
//     the server runs and with the proposed file, and lists both positions. It writes nothing.
//     The owner runs `boxxy rules dry-run <file>`; a file that does not load gives the loader's
//     rejections and reads no item.
//   - Nothing records where an item stood under older rules. `boxxy.attempt.claimed` carries the
//     rules version and the round, so pepys still knows under which rules each attempt ran.
//   - The alternative stores the decision at each settle, so a rules change moves no old item
//     and a mistake in the rules needs a retry lever per item to undo.

// ── F. The claim (modules/dispatch/src/claim-next.ts) ──────────────────────────────────────────
// `claimNext` picks with `decide` and writes the claim inside one lock. This sketch does not show
// the take SQL or `decide`; the build designs them. Inside that lock the claim also sets:
//   round   `item.position.round`, the item's round, which `buildFrame` puts on the pick. Stored on the row.
//   input   `phase.input({ item, history, pullRequests })`: for a build of round 2, the findings
//           of the review that sent the item back. Stored on the row and rendered into the prompt.
//   mode    `phase.mode?.(item) ?? 'agent'`. Stored on the row. Picks the recipe `<phase>/attended`.
//
// No new work past the cap. A limit can read `held` above `max` after an over-cap
// wake (section C). `decide` gives a start pick or a wake pick only when every limit that
// counts it has a free seat, so every pool that the full limit counts starts nothing until the
// count is back at or under `max`. Nothing stops the session that runs over the cap.
//
// `startClaim` and a refused spawn (modules/dispatch/src/claims/start-claim.ts).
// The limit `workers` (max 7) is a ceiling; the target's free imp slots can be fewer.
//
//   `worker.start` answers        what `startClaim` does
//   ────────────────────────────  ──────────────────────────────────────────────────────────────
//   started                       event `started`. The change also writes `AttemptRow.caller`
//                                 from the outcome's `caller`, and the fact carries it as
//                                 `caller`. An attempt with no caller on its row takes no
//                                 session or hook call (../edge/01-api.ts, section E).
//   unknown                       event `spawn-unanswered`; the reconcile table takes over
//   refused, cause `capacity`     settle through the normal path (`settleAttempt`): `failed`,
//                                 forced `no-capacity`, outcome `lost`. The seats and the lease
//                                 go back with the settle, and `boxxy.attempt.settled` follows
//                                 the `claimed` fact. No count against `maxAttempts`; the item
//                                 is ready again. The pool of the attempt backs off for
//                                 `timeouts.capacityBackoff` (60 s).
//   refused, any other cause      settle, forced `spawn-refused` (bad request, unknown target,
//                                 auth, worker folder not trusted). Counts against `maxAttempts`.
//
//   Before that table, the kept session. When the item has a `keptSession` and the
//   claim came through an edge with `resume: true`, `startClaim` calls `worker.resumeKept`
//   in place of `worker.start` (section H):
//   started                       event `started`, with the kept session's ID
//   unknown                       event `spawn-unanswered`, as above
//   refused, or the session gone  fall back: `worker.start`, and the table above. The `started`
//                                 fact then carries `resumeFallback: true`.
//
//   - A wake that the host refuses for capacity (`worker.resume` answers `refused`, cause
//     `capacity`) is the event `wake-refused`: the attempt is `sleeping` again, with no seat and
//     with its wake request. It is no failure and no settle.
//   - The capacity backoff holds back START picks and WAKE picks. `resumeClaim` marks the pool
//     of the refused attempt (`AttemptRow.pool`; a `WakePick` names no pool) for
//     `timeouts.capacityBackoff`, and `claimNext` gives no wake pick of an attempt whose pool is
//     in backoff. The next claim that tries the wake is in a tick after the backoff ends.
//     Why a wake pick too: `decide` puts the wake first. With start picks alone held back, the
//     claim loop of ONE tick picks the same wake again for as long as the host refuses, writes
//     `woken`, `decision.recorded` and `slept` on each turn, and never reaches the readings.
//     The cost: a start that the host refused for capacity also delays a wake in that pool, by
//     60 seconds at most. A wake over the cap (section C) is not a claim and is not held back.
//
//     `worker.resume` answers       what `resumeClaim` does                 why no claim of this tick picks it again
//     ────────────────────────────  ──────────────────────────────────────  ─────────────────────────────────────────
//     started                       event `resumed`: ─▶ `running`           it is not `sleeping`
//     unknown, or refused with      nothing. The attempt stays `waking`     it is not `sleeping`; the reading retries
//       another cause               with its seats (section B, note 5)      it, and `resume-lost` ends it
//     refused, cause `capacity`     event `wake-refused`: ─▶ `sleeping`,    its pool is in backoff until `now` + 60 s,
//                                   the request stays; marks the backoff    and `now` is one value for the whole tick
//
//     Two more guards are in `runTick` (01-usage.ts), so that a fault in this table cannot hold
//     the readings back: no item is claimed twice in one tick, and an error in the claim loop
//     ends the loop, not the tick.
//   - An attempt that hit the account's usage limit settles as `failed`, forced `usage-limit`.
//     `findPosition` skips it, as `no-capacity`. The pool backs off in the runner's memory, for
//     up to `timeouts.usageLimitBackoffHours` (24).
//     TODO (not designed): how boxxy detects the usage limit (the reading, the close-out, or
//     telemetry), and so which caller forces the failure.
//   - The backoff. `claimNext` takes the pools in backoff as an input and gives no START pick
//     and no WAKE pick in them until the time is over. Without it the claim loop of one tick
//     would pick the same item again. The mark lives in the runner's memory, per pool, not in
//     the store. A restart forgets it, and the next claim finds out again.
//   - `no-capacity` is one of the 10 values of `ForcedFailure` (02-types.ts). A capacity
//     refusal adds no fact type: the catalog has 27. pepys sees a complete attempt (`claimed`,
//     then `settled`) with zero cost, and its queries treat it as not an attempt of work.
//   - `findPosition` skips a settled attempt whose failure is `no-capacity` (section E), so it
//     neither moves the item nor counts against `maxAttempts`.
//
// The rule for an attended (human-in-the-loop) design session. ONE rule:
//   boxxy starts it, like any other attempt, when `decide` picks the item and a seat is free in
//   `workers` and in `owner-design`. No lever, no gate and no "owner is ready" signal exists.
//   The limit `owner-design` (max 1) is the only thing that holds an attended design item back.
//   An owner who is away costs one session start per attended item: the session asks its first
//   question, waits `sleep.afterIdleMinutes`, sleeps, and frees both seats for the next one.

// ── G. Derived item state (libs/model/src/items/derive-item-state.ts) ──────────────────────────
// The table reads `position` (section E). First match wins:
//
//   archived   `closed_at` is set
//   running    the item holds a live item-phase lease (a sleeping or closing attempt included)
//   waiting    position is `hold`, with its reason
//   done       position is `end`, and a pull request linked to a succeeded build attempt is merged
//   waiting    position is `end`, and a linked pull request is open                  (`pull request open`)
//   waiting    position is `end`, and every linked pull request closed unmerged     (`pull request closed unmerged`)
//   waiting    position is `end`, and no pull request is linked                     (`no pull request linked`)
//   idea       position is a phase whose kind has `needsAcceptance`, and the acceptance list is empty
//   blocked    the item has an open blocker, as the existing code derives it (`hasOpenBlocker`)
//   ready      none of the above; `buildFrame` gives the item `position.phase` and `position.round`

// ── H. The kept session, session cleanup, and notices ──────────────────────────────────────────
//
// The kept session for rework. A capability of v1, switched by one rules line:
// `changes-requested: { to: build, max: 3, resume: true }` (the default of the example rules).
//
//   when                                         what happens
//   ───────────────────────────────────────────  ─────────────────────────────────────────────────
//   a build attempt settles `built`, and an      Its session is not removed. The closing stop
//   edge of the item's pipeline goes back to     already suspended it (a stop is a suspend on an
//   build with `resume: true`                    imp). The settle's change writes the item's
//                                                `keptSession`: session ID, target, the attempt
//                                                it came from, `keptAt`.
//   the next build attempt is claimed through    `startClaim` wakes that session
//   that edge                                    (`worker.resumeKept`) and sends the phase input
//                                                (the review's findings) as a message. The new
//                                                attempt binds to the SAME atc session.
//   the wake fails, or the session is gone       A fresh spawn; `started` carries
//                                                `resumeFallback: true`; `keptSession` is cleared.
//   the item is done or closed; the review       The runner forgets the kept session
//   passed and the pull request merged;          (`worker.forget`) and clears `keptSession`.
//   `timeouts.keptSessionHours` (24) after
//   `keptAt`
//
//   - A kept session holds no seat while it sleeps. The new attempt takes its seats at its own
//     claim, as any start.
//   - How it meets the attempt machine: it does not. `keptSession` is state of the ITEM. The
//     first attempt is `succeeded` when the session is kept, and the second attempt starts with
//     the plain events `claimed` and `started`. No attempt state means "kept".
//   - One atc session then carries two attempts. `findAttemptBySession` gives the latest. The
//     fault `agent-session-owned` does not apply to the kept session's agent session ID.
//   - The settle writes `keptSession.caller` from the first attempt's
//     row. The claim through the resume edge copies it to the NEW attempt's `caller`, in the
//     claim's own change, before `worker.resumeKept` runs. So the second attempt holds its
//     caller when the resumed session makes its first call. `started` writes the outcome's
//     `caller` over it: the same value for a resumed session, a new one for a fallback spawn.
//   - With two attempts on one session, the session ID alone does not say which attempt a
//     call is for. A call from inside the session (close-out, evidence, the pull request link, the
//     session-start hook) carries the attempt ID that the session read with `attempt.current`,
//     and each of the two attempts has its own. The resumed session reads `attempt.current`
//     again and gets the NEW attempt's ID; the message that `worker.resumeKept` sends carries
//     none. A call that names the first attempt after the second one is claimed writes
//     nothing: `refused: not-current` (section D, `findCallAttempt`). The runner and that
//     comparison use `findAttemptBySession`; no procedure uses it to pick the attempt of a call.
//   - While the build's session is kept, the review runs in its own session.
//
// Session cleanup: what happens to a settled attempt's session, when it is not kept.
//   succeeded   stop, then forget (`worker.forget`): the imp is destroyed.
//   failed      keep the stopped session for `timeouts.failedSessionHours` (24), for diagnosis,
//               then forget.
//   The runner tick does it (`listSessionsToForget`), and writes `sessionForgottenAt` on the
//   attempt row. No fact type for session cleanup exists, so no fact records the forget. A
//   forget that fails is tried again on the next tick. A stray session is not forgotten before
//   it has stopped.
//
// Notices. The change that settles an attempt writes one `notices` row when the
// item's position after it is a hold (02-types.ts, `Notifier`). The tick sends unsent rows
// after the readings. A failed notice changes no attempt and no item.

// ── stubs ──────────────────────────────────────────────────────────────────────────────────────

declare function findStep(pipeline: Pipeline, phase: PhaseName): PipelineStep; // undefined when the pipeline lacks the phase
declare function findEdge(rules: LoadedRules, item: ItemView, phase: PhaseName, outcome: string): Edge | undefined; // the edge of the item's pipeline under the rules loaded at the call
declare function isHoldEdge(edge: Edge | undefined): boolean; // true for a `{ hold: reason }` edge
declare function changesItem(effect: Effect): boolean; // true for `close-item`, a relation, `set-kind`, `set-acceptance` and the design mode; false for `record-proposal`
declare function countTrailing(list: readonly Settled[], test: (settled: Settled) => boolean): number;
declare function mergeByTime(attempts: readonly Settled[], retries: readonly RetryLever[]): ({ kind: 'settled'; settled: Settled } | { kind: 'retry'; lever: RetryLever })[];
declare function readReturnedOutcome(settlement: Settlement & { returned?: string }): string | null;
declare function tryPlanEffect(effect: Effect, ctx: EffectContext): EffectPlan; // a handler that throws gives `skip`
declare function readClosedOutFact(change: StoreChange): FactId;
declare function measureJsonBytes(value: JsonValue): number; // the UTF-8 bytes of `JSON.stringify(value)`, never `.length`
declare const isLive: (state: AttemptState) => boolean;
