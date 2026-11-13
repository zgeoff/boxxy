import type {
  AttemptId,
  AttemptRow,
  ClaimStore,
  CloseOutProblem,
  Forge,
  Instant,
  JobWorker,
  LoadedRules,
  NewId,
  PhaseName,
  PipelineStep,
  RunnerId,
  Verifier,
} from '@boxxy/model';

export interface JobReadingInput {
  readonly store: ClaimStore;
  readonly runner: RunnerId;
  readonly job: JobWorker;
  readonly rules: LoadedRules;

  // the live attempt as the tick listed it
  readonly attempt: AttemptRow;

  // the attempt's step of its item's pipeline; null when the pipeline no longer has the phase
  readonly step: PipelineStep | null;
  readonly now: Instant;
  readonly newId: NewId;
}

export interface MergeJobDeps {
  readonly forge: Forge;
  readonly verifier: Verifier;

  // the item's settled review, which the merge rule reads
  readonly store: ClaimStore;
}

// A bug that a job reading met, for the runner's log. `job-without-drive`: the phase kind gives
// no `drive`, or the rules no longer hold the phase.
export type JobFault =
  | { readonly fault: 'job-without-drive'; readonly attempt: AttemptId; readonly phase: PhaseName }

  // the phase kind's parser refused the close-out that its own `drive` gave
  | {
      readonly fault: 'job-close-out-refused';
      readonly attempt: AttemptId;
      readonly problems: readonly CloseOutProblem[];
    };
