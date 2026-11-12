import type { AuthAdmin } from '@boxxy/auth-oauth';
import type {
  AtcSessionId,
  AttemptId,
  CallerIdentity,
  CallerProof,
  ClaimStore,
  Clock,
  Forge,
  LoadRejection,
  LoadResult,
  LoadedRules,
  NewId,
  OutboxStatus,
  PepysReader,
  RepoName,
  ReviewGate,
  RunnerId,
  SessionReading,
} from '@boxxy/model';

// The rules the server runs, and the last checkout the loader refused, which the previous rules
// outlive.
export interface RulesState {
  readonly rules: LoadedRules;
  readonly lastRejected: {
    readonly commit: string;
    readonly rejections: readonly LoadRejection[];
  } | null;
}

export interface OutboxControl {
  readonly status: () => Promise<OutboxStatus>;

  // asks the sender for a turn now, as after `outbox.retry`
  readonly nudge: () => void;
}

// What the notice sender last saw, which the tick writes and `runner.status` reads.
export interface NoticeStatus {
  // the reason of the most recent try that was not `sent`; null before any
  lastError: string | null;
}

// Failures and state changes only. Never a token, a header or a secret.
export interface ServerLog {
  readonly warn: (message: string, fields: Readonly<Record<string, unknown>>) => void;
}

// What every handler reads. The server builds it once; the tests build it on fakes.
export interface ServerDeps {
  readonly store: ClaimStore;
  readonly runner: RunnerId;
  readonly rulesState: () => RulesState;

  // loads the server's own rules checkout with this text as its rules file, for the dry run
  readonly loadProposedRules: (text: string) => LoadResult;
  readonly clock: Clock;
  readonly newId: NewId;
  readonly callerProof: CallerProof;

  // the SHA-256 digest of the worker token; the server never keeps the token itself
  readonly workerTokenDigest: Uint8Array;

  // null: the configuration has no pepys section
  readonly pepys: PepysReader | null;

  // null: the configuration has no github section, so the pull request link answers `retry`
  readonly forge: Forge | null;

  // the review gate a review close-out goes through, and the forge it reads the changed files
  // from; null: the noslop App's keys or the github section are missing, so the server rejects
  // each review close-out
  readonly review: { readonly gate: ReviewGate; readonly forge: Forge } | null;
  readonly outbox: OutboxControl;

  // null: the configuration has no public door, so the auth procedures answer AUTH_NOT_CONFIGURED
  readonly auth: AuthAdmin | null;

  // the repos that the configuration's spawn section names; `item.file` refuses any other
  readonly repos: ReadonlySet<RepoName>;

  // the last reading of each live attempt, which the tick writes and `runner.status` reads
  readonly readings: ReadonlyMap<AttemptId, SessionReading>;
  readonly noticeStatus: Readonly<NoticeStatus>;
  readonly log: ServerLog;
}

// The two listeners. `owner` is on the owner's private network; `worker` is the one the broker
// reaches, and every request to it needs the worker token.
export type Listener = 'owner' | 'worker';

// `worker`: the request carries the worker token. `owner`: it carries none, on the owner listener.
export type RequestScope = 'owner' | 'worker';

export interface RequestContext {
  readonly deps: ServerDeps;
  readonly scope: RequestScope;
  readonly request: Request;
}

// What the root middleware proved for a session or hook call: the caller, and the session whose
// latest attempt holds it. null: no session holds the caller.
export interface ProvenCall {
  readonly session: AtcSessionId;
  readonly caller: CallerIdentity;
}
