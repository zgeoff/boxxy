import type {
  ActorRef,
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  CallerIdentity,
  CapacityBackoff,
  Claim,
  ClaimStore,
  GitSource,
  Instant,
  ItemId,
  KeptSession,
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

  // each repo's folder on the target, or the git source that atc clones on it
  readonly repos: ReadonlyMap<RepoName, string | GitSource>;

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

  // the items that the runner's tick claimed already; the claim gives no second pick of one
  readonly claimed?: ReadonlySet<ItemId>;
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

// A session that the worker started for a claim, as the start's answer or a reading shows it.
export interface StartedSession {
  readonly via: 'start' | 'reconcile';
  readonly atcSession: AtcSessionId;
  readonly agentSession: AgentSessionId | null;
  readonly caller: CallerIdentity | null;

  // the kept session that the claim woke; null when the claim wanted none or found none
  readonly kept: KeptSession | null;

  // true when the claim wanted a kept session and the session is a fresh one
  readonly resumeFallback: boolean;
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
