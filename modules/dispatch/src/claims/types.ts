import type {
  ActorRef,
  AttemptId,
  CapacityBackoff,
  Claim,
  ClaimStore,
  Instant,
  LoadedRules,
  NewId,
  RepoName,
  RunnerId,
  WakeSource,
  WorkerKind,
} from '@boxxy/model';

// What the server reads from its configuration and the rules checkout for a spawn request. A
// module reads no files, so the claim gets these as input.
export interface SpawnSettings {
  // the worker target every session starts on
  readonly target: string;

  // each repo's path on the target
  readonly repoPaths: ReadonlyMap<RepoName, string>;

  // the text of each prompt template, by its path in the rules checkout
  readonly prompts: ReadonlyMap<string, string>;
}

export interface ClaimInput {
  readonly store: ClaimStore;
  readonly runner: RunnerId;
  readonly rules: LoadedRules;
  readonly now: Instant;
  readonly newId: NewId;

  // the runner's memory of the pools in backoff
  readonly backoff: CapacityBackoff;
  readonly spawn: SpawnSettings;
}

export interface StartClaimInput {
  readonly store: ClaimStore;
  readonly worker: WorkerKind;
  readonly rules: LoadedRules;
  readonly claim: Extract<Claim, { kind: 'start' }>;
  readonly now: Instant;
  readonly newId: NewId;
  readonly backoff: CapacityBackoff;
}

export interface ResumeClaimInput {
  readonly store: ClaimStore;
  readonly worker: WorkerKind;
  readonly claim: Extract<Claim, { kind: 'wake' }>;
  readonly now: Instant;
  readonly newId: NewId;
  readonly backoff: CapacityBackoff;
}

export interface RequestWakeInput {
  readonly store: ClaimStore;
  readonly attempt: AttemptId;
  readonly by: WakeSource;
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}
