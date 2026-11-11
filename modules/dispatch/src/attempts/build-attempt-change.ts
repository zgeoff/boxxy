import type {
  ActorRef,
  AnyNewFact,
  AttemptRow,
  AttemptSessionRow,
  AttemptState,
  DecisionRow,
  FactId,
  FactType,
  Instant,
  ItemId,
  LeaseRow,
  NewId,
  PhaseName,
  SeatRelease,
  SeatTake,
  StartPick,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { P, match } from 'ts-pattern';
import { initialTransition, isUnhandled, transition } from 'xstate';
import { attemptMachine } from './attempt-machine.ts';
import { buildAttemptFact } from './build-attempt-fact.ts';
import type {
  AttemptContext,
  AttemptEvent,
  AttemptMachineEvent,
  ClaimedEvent,
  DecisionDraft,
  MoveEffect,
  MoveEvent,
  MoveParts,
} from './types.ts';

// The columns the machine's guards read. A change expects each of them as the builder read it,
// so a move that another caller applied first makes this change a `guard-mismatch`.
type AttemptGuard = Pick<
  AttemptRow,
  | 'state'
  | 'holdGen'
  | 'suspendRequestedAt'
  | 'wakeRequestedAt'
  | 'closing'
  | 'atcSession'
  | 'strayedAt'
  | 'sessionStoppedAt'
>;

type AttemptWrite =
  | { readonly op: 'insert'; readonly table: 'attempts'; readonly row: AttemptRow }
  | {
      readonly op: 'update';
      readonly table: 'attempts';
      readonly key: { readonly id: AttemptRow['id'] };
      readonly expect: AttemptGuard;
      readonly set: Partial<AttemptRow>;
    }
  | { readonly op: 'insert'; readonly table: 'attempt_sessions'; readonly row: AttemptSessionRow }
  | { readonly op: 'insert'; readonly table: 'leases'; readonly row: LeaseRow }
  | {
      readonly op: 'update';
      readonly table: 'leases';
      readonly key: Pick<LeaseRow, 'item' | 'phase' | 'gen'>;
      readonly expect: Pick<LeaseRow, 'attempt' | 'releasedAt'>;
      readonly set: Pick<LeaseRow, 'releasedAt'>;
    }
  | { readonly op: 'insert'; readonly table: 'decisions'; readonly row: DecisionRow }
  | { readonly op: 'take-seats'; readonly take: SeatTake }
  | { readonly op: 'release-seats'; readonly release: SeatRelease };

interface AttemptStoreChange {
  readonly at: Instant;

  // the live lease and hold generation the change was built under; null for the claim, which
  // takes the lease, and for a settled attempt, whose lease is released
  readonly under: {
    readonly item: ItemId;
    readonly phase: PhaseName;
    readonly gen: number;
    readonly holdGen: number;
  } | null;
  readonly writes: readonly AttemptWrite[];

  // empty for a move that records no fact, such as the suspend mark
  readonly facts: readonly AnyNewFact[];
}

export type AttemptChange =
  | { readonly kind: 'change'; readonly change: AttemptStoreChange }
  | {
      readonly kind: 'not-allowed';
      readonly state: AttemptState;
      readonly event: AttemptEvent['kind'];
    };

interface BuildAttemptChangeBase {
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

export type BuildAttemptChangeInput = BuildAttemptChangeBase &
  (
    | { readonly attempt: null; readonly event: ClaimedEvent }
    | { readonly attempt: AttemptRow; readonly event: MoveEvent }
  );

// The one builder of every write to the attempts and attempt sessions tables, and of every seat
// write. The attempt machine decides whether the move is allowed and which writes and facts it
// makes; this function fills them in.
export function buildAttemptChange(input: BuildAttemptChangeInput): AttemptChange {
  if (input.attempt === null) {
    return { kind: 'change', change: buildClaimedChange(input, input.event) };
  }

  return buildMoveChange(input, input.attempt, input.event);
}

function buildClaimedChange(base: BuildAttemptChangeBase, event: ClaimedEvent): AttemptStoreChange {
  const [snapshot, effects] = initialTransition(attemptMachine, { mode: event.mode });

  const row: AttemptRow = {
    id: event.attempt,
    item: event.pick.item,
    phase: event.pick.phase,
    number: event.number,
    runner: event.runner,
    recipeHash: event.recipe.hash,
    rulesVersion: event.recipe.rulesVersion,
    pool: event.pick.pool,
    leaseGen: event.leaseGen,
    spawnRequest: event.spawnRequest,
    spawnRequestHash: event.spawnRequestHash,
    state: toAttemptState(snapshot.value),
    failure: null,
    atcSession: null,
    caller: event.caller,
    claimedAt: base.now,
    startedAt: null,
    endedAt: null,
    fields: event.pick.fields,
    mode: event.mode,
    round: event.pick.round,
    input: event.input,
    holdGen: snapshot.context.holdGen,
    closeOut: null,
    closeOutHash: null,
    closeOutFact: null,
    closing: null,
    closingAt: null,
    suspendRequestedAt: null,
    sleptAt: null,
    wakeRequestedAt: null,
    wokenAt: null,
    outcome: null,
    returnedOutcome: null,
    strayedAt: null,
    sessionStoppedAt: null,
    sessionForgottenAt: null,
  };

  const parts: MoveParts = {
    before: row,
    after: row,
    event,
    decision: buildDecisionRow(base, row, event.decision),
  };

  const moveEffects = collectMoveEffects(effects);

  return {
    at: base.now,
    under: null,
    writes: [
      { op: 'insert', table: 'attempts', row },
      ...collectEffectWrites(moveEffects, parts, base.now),
    ],
    facts: collectEffectFacts(buildFactIDs(moveEffects, base), parts, base),
  };
}

function toAttemptState(value: unknown): AttemptState {
  invariant(isAttemptState(value), `the attempt machine has no state ${String(value)}`);

  return value;
}

const attemptStates: readonly string[] = [
  'starting',
  'running',
  'reconciling',
  'sleeping',
  'waking',
  'closing',
  'succeeded',
  'failed',
] satisfies readonly AttemptState[];

function isAttemptState(value: unknown): value is AttemptState {
  return typeof value === 'string' && attemptStates.includes(value);
}

function buildDecisionRow(
  base: BuildAttemptChangeBase,
  attempt: AttemptRow,
  draft: DecisionDraft,
): DecisionRow {
  return {
    ...draft,
    id: brandSchemas.decisionId.parse(base.newId()),
    attempt: attempt.id,
    at: base.now,
  };
}

function collectMoveEffects(effects: readonly unknown[]): MoveEffect[] {
  return effects.flatMap((effect) => (isEffectEmit(effect) ? [effect.event.effect] : []));
}

interface EffectEmit {
  readonly kind: 'emit';
  readonly event: { readonly type: 'effect'; readonly effect: MoveEffect };
}

function isEffectEmit(effect: unknown): effect is EffectEmit {
  return (
    typeof effect === 'object' &&
    effect !== null &&
    'kind' in effect &&
    effect.kind === 'emit' &&
    'event' in effect &&
    typeof effect.event === 'object' &&
    effect.event !== null &&
    'type' in effect.event &&
    effect.event.type === 'effect'
  );
}

function collectEffectWrites(
  effects: readonly MoveEffect[],
  parts: MoveParts,
  now: Instant,
): AttemptWrite[] {
  return effects.flatMap((effect) =>
    isFactEffect(effect) ? [] : [buildEffectWrite(effect, parts, now)],
  );
}

function isFactEffect(effect: MoveEffect): effect is FactType {
  return effect.startsWith('boxxy.');
}

function buildEffectWrite(
  effect: Exclude<MoveEffect, FactType>,
  parts: MoveParts,
  now: Instant,
): AttemptWrite {
  const before = parts.before;
  const after = parts.after;

  return match(effect)
    .with('take-lease', () => ({
      op: 'insert' as const,
      table: 'leases' as const,
      row: {
        item: after.item,
        phase: after.phase,
        attempt: after.id,
        gen: after.leaseGen,
        takenAt: now,
        releasedAt: null,
      },
    }))
    .with('release-lease', () => ({
      op: 'update' as const,
      table: 'leases' as const,
      key: { item: before.item, phase: before.phase, gen: before.leaseGen },
      expect: { attempt: before.id, releasedAt: null },
      set: { releasedAt: now },
    }))
    .with('take-seats', () => ({
      op: 'take-seats' as const,
      take: {
        limits: getSeatLimits(parts.event),
        attempt: after.id,
        holdGen: after.holdGen,
        overCap: parts.event.kind === 'woken' && parts.event.overCap,
      },
    }))
    .with('release-seats', () => ({
      op: 'release-seats' as const,
      release: { attempt: before.id, holdGen: before.holdGen },
    }))
    .with('record-decision', () => {
      invariant(parts.decision !== null, 'a move that records a decision carries one');

      return { op: 'insert' as const, table: 'decisions' as const, row: parts.decision };
    })
    .with('bind-session', () => {
      invariant(parts.event.kind === 'session-seen', 'only session-seen binds a session');

      return { op: 'insert' as const, table: 'attempt_sessions' as const, row: parts.event.row };
    })
    .exhaustive();
}

function getSeatLimits(event: AttemptEvent): StartPick['limits'] {
  invariant(event.kind === 'claimed' || event.kind === 'woken', 'only a pick takes seats');

  return event.pick.limits;
}

function collectEffectFacts(
  factIDs: ReadonlyMap<FactType, FactId>,
  parts: MoveParts,
  base: BuildAttemptChangeBase,
): AnyNewFact[] {
  return [...factIDs].map(([type, id]) =>
    buildAttemptFact(type, parts, { id, actor: base.actor, now: base.now }),
  );
}

function buildFactIDs(
  effects: readonly MoveEffect[],
  base: BuildAttemptChangeBase,
): Map<FactType, FactId> {
  return new Map(
    effects
      .filter((effect) => isFactEffect(effect))
      .map((type) => [type, brandSchemas.factId.parse(base.newId())]),
  );
}

function buildMoveChange(
  base: BuildAttemptChangeBase,
  attempt: AttemptRow,
  event: MoveEvent,
): AttemptChange {
  const before = attemptMachine.resolveState({
    value: attempt.state,
    context: toAttemptContext(attempt),
  });

  const result = transition(attemptMachine, before, toMachineEvent(event));

  if (isUnhandled(before, result)) {
    return { kind: 'not-allowed', state: attempt.state, event: event.kind };
  }

  const [after, effects] = result;
  const moveEffects = collectMoveEffects(effects);
  const decision = event.kind === 'woken' ? buildDecisionRow(base, attempt, event.decision) : null;

  // the IDs first: the close-out's row names the ID of its fact
  const factIDs = buildFactIDs(moveEffects, base);

  const set: Partial<AttemptRow> = {
    state: toAttemptState(after.value),
    ...buildContextColumns(before.context, after.context, base.now),
    ...buildEventColumns(event, attempt, base.now, factIDs),
  };

  const parts: MoveParts = { before: attempt, after: { ...attempt, ...set }, event, decision };

  const update: AttemptWrite = {
    op: 'update',
    table: 'attempts',
    key: { id: attempt.id },
    expect: toAttemptGuard(attempt),
    set,
  };

  return {
    kind: 'change',
    change: {
      at: base.now,
      under: isLiveState(attempt.state)
        ? {
            item: attempt.item,
            phase: attempt.phase,
            gen: attempt.leaseGen,
            holdGen: attempt.holdGen,
          }
        : null,

      // a bound session changes no column of the attempt
      writes: [
        ...(event.kind === 'session-seen' ? [] : [update]),
        ...collectEffectWrites(moveEffects, parts, base.now),
      ],
      facts: collectEffectFacts(factIDs, parts, base),
    },
  };
}

function toAttemptContext(attempt: AttemptRow): AttemptContext {
  return {
    mark: attempt.suspendRequestedAt !== null,
    wakeRequested: attempt.wakeRequestedAt !== null,
    mode: attempt.mode,
    holdGen: attempt.holdGen,
    closing: attempt.closing,
    hasSession: attempt.atcSession !== null,
    strayed: attempt.strayedAt !== null,
    sessionStopped: attempt.sessionStoppedAt !== null,
  };
}

function toMachineEvent(event: MoveEvent): AttemptMachineEvent {
  return match(event)
    .with({ kind: 'started' }, (started) => ({ type: 'started', via: started.via }) as const)
    .with({ kind: 'woken' }, (woken) => ({ type: 'woken', overCap: woken.overCap }) as const)
    .with(
      { kind: 'settled' },
      (settled) =>
        ({
          type: 'settled',
          state: settled.state,
          sessionStopped: settled.sessionStopped,
        }) as const,
    )
    .with(
      {
        kind: P.union(
          'spawn-unanswered',
          'session-seen',
          'closed-out',
          'timed-out',
          'item-closed',
          'turn-ended',
          'stalled',
          'skill-missing',
          'usage-limited',
          'suspend-asked',
          'suspend-refused',
          'slept',
          'wake-requested',
          'resumed',
          'wake-refused',
          'stray-stopped',
        ),
      },
      (other) => ({ type: other.kind }),
    )
    .exhaustive();
}

// The columns behind the context fields that the move changed.
function buildContextColumns(
  before: AttemptContext,
  after: AttemptContext,
  now: Instant,
): Partial<AttemptRow> {
  return {
    ...(before.mark === after.mark ? {} : { suspendRequestedAt: after.mark ? now : null }),
    ...(before.wakeRequested === after.wakeRequested
      ? {}
      : { wakeRequestedAt: after.wakeRequested ? now : null }),
    ...(before.holdGen === after.holdGen ? {} : { holdGen: after.holdGen }),
    ...(before.closing === after.closing ? {} : { closing: after.closing, closingAt: now }),
    ...(before.strayed === after.strayed ? {} : { strayedAt: after.strayed ? now : null }),
    ...(before.sessionStopped === after.sessionStopped
      ? {}
      : { sessionStoppedAt: after.sessionStopped ? now : null }),
  };
}

// The columns that hold the event's own data.
function buildEventColumns(
  event: MoveEvent,
  attempt: AttemptRow,
  now: Instant,
  factIDs: ReadonlyMap<FactType, FactId>,
): Partial<AttemptRow> {
  return match(event)
    .with({ kind: 'started' }, (started) => ({
      atcSession: started.atcSession,
      caller: started.caller,
      startedAt: attempt.startedAt ?? now,
    }))
    .with({ kind: 'closed-out' }, (closed) => ({
      closeOut: closed.closeOut,
      closeOutHash: closed.hash,
      closeOutFact: getFactID(factIDs, 'boxxy.attempt.closed_out'),
    }))
    .with({ kind: 'slept' }, () => ({ sleptAt: now }))
    .with({ kind: 'woken' }, () => ({ wokenAt: now }))
    .with({ kind: 'resumed' }, (resumed) => ({
      atcSession: resumed.atcSession,
      caller: resumed.caller,
    }))
    .with({ kind: 'settled' }, (settled) => ({
      failure: settled.failure,
      outcome: settled.outcome,
      returnedOutcome: settled.returnedOutcome,
      endedAt: now,
    }))
    .with(
      {
        kind: P.union(
          'spawn-unanswered',
          'session-seen',
          'timed-out',
          'item-closed',
          'turn-ended',
          'stalled',
          'skill-missing',
          'usage-limited',
          'suspend-asked',
          'suspend-refused',
          'wake-requested',
          'wake-refused',
          'stray-stopped',
        ),
      },
      () => ({}),
    )
    .exhaustive();
}

function getFactID(factIDs: ReadonlyMap<FactType, FactId>, type: FactType): FactId {
  const id = factIDs.get(type);

  invariant(id !== undefined, `the move records ${type}`);

  return id;
}

function toAttemptGuard(attempt: AttemptRow): AttemptGuard {
  return {
    state: attempt.state,
    holdGen: attempt.holdGen,
    suspendRequestedAt: attempt.suspendRequestedAt,
    wakeRequestedAt: attempt.wakeRequestedAt,
    closing: attempt.closing,
    atcSession: attempt.atcSession,
    strayedAt: attempt.strayedAt,
    sessionStoppedAt: attempt.sessionStoppedAt,
  };
}

function isLiveState(state: AttemptState): boolean {
  return state !== 'succeeded' && state !== 'failed';
}
