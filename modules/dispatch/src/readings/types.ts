import type {
  AttemptRow,
  CapacityBackoff,
  ClaimStore,
  ForcedFailure,
  Instant,
  LiveAttemptState,
  LoadedRules,
  NewId,
  PipelineStep,
  SessionReading,
  SleepRules,
  WakeSource,
  WorkerKind,
} from '@boxxy/model';

// What the runner does with one reading of a live attempt's session.
export type ReadingAction =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'bind-only' }
  | { readonly kind: 'move-to-running'; readonly via: 'reconcile' | 'resume' }

  // sends the stored spawn request again
  | { readonly kind: 'respawn' }
  | { readonly kind: 'clear-mark' }
  | { readonly kind: 'sleep-if-idle'; readonly waitingSince: Instant }

  // the mark, then a suspend with no idle check, then `slept`
  | { readonly kind: 'sleep-unattended'; readonly since: Instant }

  // `closing` with no session seen: no respawn and no settle yet
  | { readonly kind: 'await-spawn' }

  // the session stopped with no sleep of boxxy's in progress, or after the mark
  | { readonly kind: 'sleep'; readonly requestWake: boolean }
  | { readonly kind: 'request-wake'; readonly by: WakeSource }
  | { readonly kind: 'wake-over-cap' }

  // asks the worker to resume the woken session again
  | { readonly kind: 'resume' }
  | {
      readonly kind: 'close';
      readonly cause: 'timed-out';
      readonly afterMinutes: number;
    }
  | { readonly kind: 'close'; readonly cause: 'turn-ended' | 'stalled' }
  | {
      readonly kind: 'close';
      readonly cause: 'usage-limit';
      readonly resetsAt: Instant | null;
    }
  | { readonly kind: 'stop' }
  | {
      readonly kind: 'settle';
      readonly forced: ForcedFailure | null;
      readonly sessionStopped: boolean;
    };

export interface ReadingInput<Reading extends SessionReading = SessionReading> {
  readonly attempt: AttemptRow;
  readonly reading: Reading;

  // the attempt's step in the item's pipeline; null when the rules lost the phase
  readonly step: PipelineStep | null;
  readonly sleep: SleepRules;
  readonly now: Instant;
}

type ReadingRule<Kind extends SessionReading['kind']> = (
  input: ReadingInput<Extract<SessionReading, { kind: Kind }>>,
) => ReadingAction;

// One rule for each reading and each live state, so the type check proves every cell is there.
export type ReadingTable = {
  readonly [Kind in SessionReading['kind']]: Readonly<Record<LiveAttemptState, ReadingRule<Kind>>>;
};

export interface ActOnReadingInput {
  readonly store: ClaimStore;
  readonly worker: WorkerKind;
  readonly rules: LoadedRules;
  readonly backoff: CapacityBackoff;

  // the attempt as the runner listed it before the reading
  readonly attempt: AttemptRow;
  readonly reading: SessionReading;
  readonly action: ReadingAction;
  readonly now: Instant;
  readonly newId: NewId;
}

// One bound of a running attempt whose session runs. The first bound that gives an action wins.
export interface RunningBound {
  readonly name: string;
  readonly pick: (
    input: ReadingInput<Extract<SessionReading, { kind: 'running' }>>,
  ) => ReadingAction | null;
}
