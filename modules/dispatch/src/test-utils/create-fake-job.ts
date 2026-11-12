import type {
  AttemptRow,
  DriveContext,
  JobActAnswer,
  JobAction,
  JobStep,
  JobWorker,
} from '@boxxy/model';

export interface FakeJob {
  readonly worker: JobWorker;

  // the phase kind's drive: the step the test set, or `pastDeadline` once the deadline passed
  readonly drive: (ctx: DriveContext) => JobStep;
  readonly setStep: (step: JobStep, pastDeadline?: JobStep) => void;
  readonly setAnswer: (answer: JobActAnswer) => void;

  // the next read throws this, as a forge with no answer does
  readonly failNextRead: (error: Error) => void;

  // runs inside the next read, before it answers, as another writer would
  readonly beforeNextRead: (hook: () => Promise<void>) => void;
  readonly reads: readonly AttemptRow[];
  readonly acts: readonly { readonly attempt: AttemptRow; readonly action: JobAction }[];
  readonly drives: readonly DriveContext[];
}

// A job worker and the drive of its phase kind, scripted by the test. The read observes nothing:
// the drive gives the step the test set.
export function createFakeJob(): FakeJob {
  const reads: AttemptRow[] = [];
  const acts: { attempt: AttemptRow; action: JobAction }[] = [];
  const drives: DriveContext[] = [];

  const script: {
    step: JobStep;
    pastDeadline: JobStep | null;
    answer: JobActAnswer;
    failure: Error | null;
    hook: (() => Promise<void>) | null;
  } = {
    step: { kind: 'wait', reason: 'checks pending', pending: [] },
    pastDeadline: null,
    answer: { kind: 'unknown', reason: 'the forge did not answer' },
    failure: null,
    hook: null,
  };

  return {
    worker: {
      read: async (attempt) => {
        const hook = script.hook;
        const failure = script.failure;

        script.hook = null;
        script.failure = null;

        await hook?.();

        if (failure !== null) {
          throw failure;
        }

        reads.push(attempt);

        return { kind: 'running', observed: { read: reads.length } };
      },
      act: (attempt, action) => {
        acts.push({ attempt, action });

        return Promise.resolve(script.answer);
      },
    },
    drive: (ctx) => {
      drives.push(ctx);

      return ctx.deadlinePassed && script.pastDeadline !== null ? script.pastDeadline : script.step;
    },
    setStep: (step, pastDeadline) => {
      script.step = step;
      script.pastDeadline = pastDeadline ?? null;
    },
    setAnswer: (answer) => {
      script.answer = answer;
    },
    failNextRead: (error) => {
      script.failure = error;
    },
    beforeNextRead: (hook) => {
      script.hook = hook;
    },
    reads,
    acts,
    drives,
  };
}
