import { contentHash } from '@boxxy/content-hash';
import type {
  ActorRef,
  AttemptRow,
  CloseOutProblem,
  ForcedFailure,
  JobAction,
  JobStep,
  JsonValue,
  PhaseKind,
} from '@boxxy/model';
import { closeOutSchema, toJSONValue } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { MoveEvent, MoveResult } from '../attempts/types.ts';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { readCloseOutContext } from '../closeouts/read-close-out-context.ts';
import { settleAttempt } from '../closeouts/settle-attempt.ts';
import { findClosingFailure } from '../readings/find-closing-failure.ts';
import { timeouts } from '../timeouts.ts';
import type { JobFault, JobReadingInput } from './types.ts';

// One tick's read of a live job attempt. The first read moves it from starting to running, and
// the phase kind's `drive` then finishes it, has it wait, or picks its one action. A read that
// throws leaves the attempt as it is, and the next tick reads it again.
export async function runJobReading(input: JobReadingInput): Promise<JobFault | null> {
  const attempt = input.attempt;

  if (attempt.state === 'closing') {
    await settleJob(input, findClosingFailure(attempt));

    return null;
  }

  if (!isReadDue(input)) {
    return null;
  }

  const phase = input.rules.phases.get(attempt.phase);
  const drive = phase?.drive;

  if (phase === undefined || drive === undefined) {
    return { fault: 'job-without-drive', attempt: attempt.id, phase: attempt.phase };
  }

  const reading = await input.job.read(attempt);

  if (attempt.state === 'starting') {
    const started = await writeJobMove(input, { kind: 'job-started' });

    if (started.kind !== 'applied') {
      return null;
    }
  }

  const row = await readJobAttempt(input);

  const step = drive({
    observed: reading.observed,
    attempt: row,
    deadlinePassed: isDeadlinePassed(input),
    rules: input.rules,
    now: input.now,
    actRetryMinutes: timeouts.actRetryMinutes,
  });

  return runJobStep(input, phase, row, step);
}

function settleJob(
  input: JobReadingInput,
  forced: ForcedFailure | 'closeout-unsettleable' | null,
): Promise<MoveResult> {
  return settleAttempt({
    ...buildBase(input),
    store: input.store,
    attempt: input.attempt.id,
    forced,
    sessionStopped: true,
    rules: input.rules,
  });
}

function buildBase(input: JobReadingInput) {
  const actor: ActorRef = `boxxy:runner:${input.runner}`;

  return { actor, now: input.now, newId: input.newId };
}

const secondMs = 1000;

function isReadDue(input: JobReadingInput): boolean {
  const readAt = input.attempt.readAt;

  return readAt === null || input.now - readAt >= timeouts.jobReadSeconds * secondMs;
}

function writeJobMove(input: JobReadingInput, event: MoveEvent): Promise<MoveResult> {
  return input.store.exclusive((tx) =>
    writeAttemptMove(tx, input.attempt.id, event, buildBase(input)),
  );
}

async function readJobAttempt(input: JobReadingInput): Promise<AttemptRow> {
  const row = await input.store.read((tx) => tx.readAttempt(input.attempt.id));

  invariant(row !== null, `a live attempt stays stored: ${input.attempt.id}`);

  return row;
}

const minuteMs = 60_000;

function isDeadlinePassed(input: JobReadingInput): boolean {
  return (
    input.step !== null &&
    input.now - input.attempt.claimedAt > input.step.timeoutMinutes * minuteMs
  );
}

function runJobStep(
  input: JobReadingInput,
  phase: PhaseKind,
  row: AttemptRow,
  step: JobStep,
): Promise<JobFault | null> {
  return match(step)
    .with({ kind: 'finish' }, (finish) => finishJob(input, phase, finish.closeOut))
    .with({ kind: 'wait' }, async (wait) => {
      await writeJobMove(input, { kind: 'waited', reason: wait.reason });

      return null;
    })
    .with({ kind: 'act' }, async (act) => {
      await runJobAction(input, row, act.action);

      return null;
    })
    .exhaustive();
}

type FinishResult =
  | { readonly kind: 'invalid'; readonly problems: readonly CloseOutProblem[] }
  | { readonly kind: 'moved'; readonly moved: MoveResult };

// The close-out goes through the phase kind's parser, as an agent's does. A body that the parser
// refuses is the phase kind's own bug, so the attempt settles unsettleable and the runner logs it.
async function finishJob(
  input: JobReadingInput,
  phase: PhaseKind,
  body: JsonValue,
): Promise<JobFault | null> {
  const recorded = await input.store.exclusive(async (tx): Promise<FinishResult> => {
    const row = await tx.readAttempt(input.attempt.id);

    invariant(row !== null, `a live attempt stays stored: ${input.attempt.id}`);

    const ctx = await readCloseOutContext(tx, row, input.rules, input.now);

    const parsed = phase.closeOut.parse(body, ctx);

    if (parsed.kind === 'invalid') {
      return { kind: 'invalid', problems: parsed.problems };
    }

    const closeOut = closeOutSchema.safeParse(parsed.closeOut);

    invariant(closeOut.success, `the phase kind ${row.phase} gives a close-out of a known shape`);

    const event = {
      kind: 'job-finished',
      closeOut: closeOut.data,
      hash: contentHash(toJSONValue(body)),
    } as const;

    const moved = await writeAttemptMove(tx, row.id, event, buildBase(input));

    return { kind: 'moved', moved };
  });

  if (recorded.kind === 'invalid') {
    await settleJob(input, 'closeout-unsettleable');

    return {
      fault: 'job-close-out-refused',
      attempt: input.attempt.id,
      problems: recorded.problems,
    };
  }

  // a job holds no session to stop, so it settles in the same tick
  if (recorded.moved.kind === 'applied') {
    await settleJob(input, null);
  }

  return null;
}

// The action in three moves: the mark under the lease, the call outside the lock, and the
// answer. A refused mark sends no call, and a call with no answer writes nothing more.
async function runJobAction(
  input: JobReadingInput,
  row: AttemptRow,
  action: JobAction,
): Promise<void> {
  // a mark from a row that another runner's read or mark moved is refused, so one call goes out
  const marked = await input.store.exclusive((tx) =>
    writeAttemptMove(
      tx,
      row.id,
      { kind: 'acted', action },
      { ...buildBase(input), seen: { readAt: row.readAt, actedAt: row.actedAt } },
    ),
  );

  if (marked.kind !== 'applied') {
    return;
  }

  const answer = await input.job.act(row, action);

  if (answer.kind !== 'unknown') {
    await writeJobMove(input, { kind: 'answered', answer });
  }
}
