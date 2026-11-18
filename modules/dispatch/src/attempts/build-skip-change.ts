import type {
  ActorRef,
  AttemptId,
  AttemptRow,
  FactId,
  Instant,
  ItemId,
  PhaseName,
  RecipeHash,
  RulesVersion,
  RunnerId,
  SkipReason,
  StoreChange,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

interface BuildSkipChangeInput {
  readonly attempt: AttemptId;
  readonly fact: FactId;
  readonly actor: ActorRef;
  readonly runner: RunnerId;
  readonly now: Instant;
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly round: number;

  // one above the item's attempts of the phase, skipped ones included
  readonly number: number;
  readonly reason: SkipReason;

  // true: the skip also writes a notify notice for the owner
  readonly notice: boolean;
  readonly recipeHash: RecipeHash;
  readonly rulesVersion: RulesVersion;
}

const skipWorker = brandSchemas.workerKindName.parse('skip');

// The one change of a skip: a settled attempt row that ran nothing, and its fact. It has no
// session, pool, spawn request, lease or decision, so the attempt machine never sees it.
export function buildSkipChange(input: BuildSkipChangeInput): StoreChange {
  const row: AttemptRow = {
    id: input.attempt,
    item: input.item,
    phase: input.phase,
    number: input.number,
    runner: input.runner,
    recipeHash: input.recipeHash,
    rulesVersion: input.rulesVersion,
    pool: null,
    leaseGen: 0,
    spawnRequest: null,
    spawnRequestHash: null,
    state: 'succeeded',
    failure: null,
    atcSession: null,
    caller: null,
    claimedAt: input.now,
    startedAt: null,
    endedAt: input.now,
    fields: {},
    mode: 'agent',
    round: input.round,
    input: null,
    holdGen: 1,
    closeOut: null,
    closeOutHash: null,
    closeOutFact: null,
    closing: null,
    closingAt: null,
    suspendRequestedAt: null,
    sleptAt: null,
    wakeRequestedAt: null,
    wokenAt: null,
    outcome: 'skipped',
    returnedOutcome: null,
    refusal: null,
    strayedAt: null,
    sessionStoppedAt: null,
    sessionForgottenAt: null,
    worker: skipWorker,
    actedAt: null,
    actedHead: null,
    actedAnswer: null,
    readAt: null,
    waitReason: null,
    skipReason: input.reason,
  };

  return {
    at: input.now,
    writes: [
      { op: 'insert', table: 'attempts', row },
      ...(input.notice
        ? [
            {
              op: 'insert',
              table: 'notices',

              // the store numbers each notice, so the ID here is replaced
              row: {
                id: 1,
                kind: 'notify',
                item: input.item,
                phase: input.phase,
                reason: input.reason,
                pause: null,
                at: input.now,
                tries: 0,
                sentAt: null,
                keySeq: 0,
                keyTries: 0,
                nextTryAt: input.now,
              },
            } as const,
          ]
        : []),
    ],
    facts: [
      {
        id: input.fact,
        type: 'boxxy.attempt.skipped',
        entity: `boxxy:item:${input.item}`,
        actor: input.actor,
        payload: {
          attemptId: input.attempt,
          itemId: input.item,
          phase: input.phase,
          round: input.round,
          reason: input.reason,
        },
      },
    ],
  };
}
