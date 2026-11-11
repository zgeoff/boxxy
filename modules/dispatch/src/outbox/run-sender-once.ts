import { brandSchemas } from '@boxxy/model';
import type { Instant, OutboxFact, SinkAnswer } from '@boxxy/model';
import { match } from 'ts-pattern';
import { buildBackoffMs } from './build-backoff-ms.ts';
import { pickSenderMove } from './pick-sender-move.ts';
import { takeBatch } from './take-batch.ts';
import type { SenderDeps, SenderMove, SenderState, SenderTurn } from './types.ts';

// One turn of the sender: sends one batch and does what the answer says. It takes the state that
// the last turn returned. The caller waits until `nextTryAt` after `retry` and `blocked`, and
// calls again at once after `stored`, `parked` and `split`.
export async function runSenderOnce(deps: SenderDeps, state: SenderState): Promise<SenderTurn> {
  const queue = state.queue.length > 0 ? state.queue : await readQueue(deps);

  if (queue === 'parked') {
    return { step: 'parked', state: { ...state, phase: 'idle', nextTryAt: null } };
  }

  const [head, ...rest] = queue;

  if (head === undefined) {
    return { step: 'idle', state: { ...state, queue: [], phase: 'idle', nextTryAt: null } };
  }

  const answer = await deps.sink.send(head);

  const move = pickSenderMove({
    answer,
    batchSize: head.length,
    parkRun: state.parkRun,
    limits: deps.limits,
  });

  return runMove(deps, { state, batch: head, rest, answer, move, at: deps.clock.now() });
}

// The next batch from the store. An oversize first row is parked and no batch is sent this turn.
async function readQueue(deps: SenderDeps): Promise<readonly (readonly OutboxFact[])[] | 'parked'> {
  const rows = await deps.store.read((tx) => tx.readUnsentFacts(deps.limits.batchFacts));

  const taken = takeBatch(rows, deps.limits);

  if (taken.kind === 'batch') {
    return taken.facts.length === 0 ? [] : [taken.facts];
  }

  const at = deps.clock.now();

  await deps.store.exclusive((tx) => tx.parkFacts([taken.fact.factId], 'too-large', at));

  return 'parked';
}

interface MoveInput {
  readonly state: SenderState;
  readonly batch: readonly OutboxFact[];
  readonly rest: readonly (readonly OutboxFact[])[];
  readonly answer: SinkAnswer;
  readonly move: SenderMove;
  readonly at: Instant;
}

function runMove(deps: SenderDeps, input: MoveInput): Promise<SenderTurn> {
  const state = input.state;
  const failingSince = state.failingSince ?? input.at;
  const lastError = buildLastError(input.answer, input.move, input.at);

  return match(input.move)
    .with({ kind: 'mark-sent' }, async (): Promise<SenderTurn> => {
      const ids = input.batch.map((fact) => fact.factId);

      await deps.store.exclusive((tx) => tx.markFactsSent(ids, input.at));

      return {
        step: 'stored',
        state: {
          ...state,
          queue: input.rest,
          retries: 0,
          parkRun: 0,
          phase: 'idle',
          failingSince: null,
          nextTryAt: null,
          lastStoredAt: input.at,
        },
      };
    })
    .with({ kind: 'retry-same' }, (): Promise<SenderTurn> => {
      const retries = state.retries + 1;
      const waitMs = buildBackoffMs(retries, deps.limits, deps.random());

      return Promise.resolve({
        step: 'retry',
        state: {
          ...state,
          queue: [input.batch, ...input.rest],
          retries,
          phase: 'backing-off',
          failingSince,
          nextTryAt: brandSchemas.instant.parse(input.at + waitMs),
          lastError,
        },
      });
    })
    .with({ kind: 'split' }, (): Promise<SenderTurn> => {
      const middle = Math.ceil(input.batch.length / 2);

      return Promise.resolve({
        step: 'split',
        state: {
          ...state,
          queue: [input.batch.slice(0, middle), input.batch.slice(middle), ...input.rest],
          phase: 'idle',
          failingSince,
          nextTryAt: null,
          lastError,
        },
      });
    })
    .with({ kind: 'park' }, async (parked): Promise<SenderTurn> => {
      const ids = input.batch.map((fact) => fact.factId);

      await deps.store.exclusive((tx) => tx.parkFacts(ids, parked.reason, input.at));

      return {
        step: 'parked',
        state: {
          ...state,
          queue: input.rest,
          parkRun: state.parkRun + 1,
          phase: 'idle',
          failingSince,
          nextTryAt: null,
          lastError,
        },
      };
    })
    .with({ kind: 'block' }, (): Promise<SenderTurn> =>
      Promise.resolve({
        step: 'blocked',
        state: {
          ...state,
          queue: [input.batch, ...input.rest],
          phase: 'blocked',
          failingSince,
          nextTryAt: brandSchemas.instant.parse(input.at + deps.limits.blockedRetryMs),
          lastError,
        },
      }),
    )
    .exhaustive();
}

function buildLastError(
  answer: SinkAnswer,
  move: SenderMove,
  at: Instant,
): SenderState['lastError'] {
  return match(answer)
    .with({ kind: 'stored' }, () => null)
    .with({ kind: 'retry' }, (retry) => ({
      kind: retry.kind,
      status: null,
      message: retry.reason,
      at,
    }))
    .with({ kind: 'refused-batch' }, { kind: 'refused-sink' }, (refused) => ({
      kind: refused.kind,
      status: refused.status,
      message: move.kind === 'block' ? move.reason : refused.reason,
      at,
    }))
    .exhaustive();
}
