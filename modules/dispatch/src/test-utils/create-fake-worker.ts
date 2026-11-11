import type {
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  Attention,
  Clock,
  Instant,
  SessionReading,
  StartOutcome,
  WorkerKind,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { match } from 'ts-pattern';

type FailableMethod = 'start' | 'suspend' | 'resume' | 'stop' | 'forget' | 'resumeKept';

export type FakeFailure =
  | { readonly kind: 'refused'; readonly cause: 'capacity' | 'other'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string };

// What a test sets a session to. A field left out keeps the session's value.
export type FakeSession =
  | {
      readonly state: 'running';
      readonly attention?: Attention;
      readonly lastActivityAt?: Instant;
      readonly lastOwnerAt?: Instant;
      readonly agentSession?: AgentSessionId | null;
      readonly usageLimitResetsAt?: Instant | null;
    }
  | {
      readonly state: 'suspended';
      readonly asked?: boolean;
      readonly agentSession?: AgentSessionId | null;
    }
  | { readonly state: 'ended'; readonly agentSession?: AgentSessionId | null }
  | { readonly state: 'absent' };

export interface FakeWorkerCall {
  readonly method: keyof WorkerKind;

  // the attempt the call was for, or the forgotten session
  readonly subject: string;
}

export interface FakeWorker extends WorkerKind {
  readonly calls: readonly FakeWorkerCall[];

  // the session that the worker gave the attempt, or that its spawn name finds
  setSession: (attempt: AttemptId, session: FakeSession) => void;
  failNext: (method: FailableMethod, failure: FakeFailure) => void;
  failAlways: (method: FailableMethod, failure: FakeFailure) => void;
}

interface Session {
  id: AtcSessionId;
  state: 'running' | 'suspended' | 'ended';
  attention: Attention;
  lastActivityAt: Instant;
  lastOwnerAt: Instant;
  agentSession: AgentSessionId | null;
  usageLimitResetsAt: Instant | null;
  asked: boolean;
}

// A worker host in memory. A started session runs and works, a stop suspends it as an imp
// target does, and every session gives the caller `https://fake-worker.test` with its own ID.
interface FakeWorkerInput {
  readonly clock: Clock;
}

export function createFakeWorker(input: FakeWorkerInput): FakeWorker {
  const sessions = new Map<AtcSessionId, Session>();
  const byAttempt = new Map<AttemptId, AtcSessionId>();

  const calls: FakeWorkerCall[] = [];

  const once = new Map<FailableMethod, FakeFailure>();
  const always = new Map<FailableMethod, FakeFailure>();

  let count = 0;

  const takeFailure = (method: FailableMethod): FakeFailure | null => {
    const failure = once.get(method) ?? always.get(method) ?? null;

    once.delete(method);

    return failure;
  };

  const findSession = (attempt: AttemptRow): Session | null => {
    const id = attempt.atcSession ?? byAttempt.get(attempt.id) ?? null;

    return id === null ? null : (sessions.get(id) ?? null);
  };

  const createSession = (): Session => {
    count += 1;

    const session: Session = {
      id: brandSchemas.atcSessionId.parse(`atc-${count}`),
      state: 'running',
      attention: 'working',
      lastActivityAt: input.clock.now(),
      lastOwnerAt: input.clock.now(),
      agentSession: brandSchemas.agentSessionId.parse(`agent-${count}`),
      usageLimitResetsAt: null,
      asked: false,
    };

    sessions.set(session.id, session);

    return session;
  };

  const runSession = (session: Session): StartOutcome => {
    Object.assign(session, {
      state: 'running',
      attention: 'working',
      lastActivityAt: input.clock.now(),
    });

    return {
      kind: 'started',
      atcSession: session.id,
      agentSession: session.agentSession,
      caller: { issuer: 'https://fake-worker.test', subject: session.id },
    };
  };

  return {
    calls,
    start: (request) => {
      calls.push({ method: 'start', subject: request.idempotencyKey });

      const failure = takeFailure('start');

      if (failure !== null) {
        return Promise.resolve(failure);
      }

      const known = byAttempt.get(request.idempotencyKey);
      const session = (known === undefined ? null : sessions.get(known)) ?? createSession();

      byAttempt.set(request.idempotencyKey, session.id);

      return Promise.resolve(runSession(session));
    },
    reconcile: (attempt) => {
      calls.push({ method: 'reconcile', subject: attempt.id });

      return Promise.resolve(toReading(findSession(attempt)));
    },
    suspend: (attempt, ifIdleSince) => {
      calls.push({ method: 'suspend', subject: attempt.id });

      const failure = takeFailure('suspend');
      const session = findSession(attempt);

      if (failure !== null) {
        return Promise.resolve({ kind: failure.kind, reason: failure.reason });
      }

      if (session === null) {
        return Promise.resolve({ kind: 'refused', reason: 'no such session' });
      }

      if (ifIdleSince !== null && session.lastActivityAt > ifIdleSince) {
        return Promise.resolve({ kind: 'active' });
      }

      Object.assign(session, { state: 'suspended', asked: true });

      return Promise.resolve({ kind: 'suspended' });
    },
    resume: (attempt) => {
      calls.push({ method: 'resume', subject: attempt.id });

      const failure = takeFailure('resume');
      const session = findSession(attempt);

      if (failure !== null) {
        return Promise.resolve(failure);
      }

      const outcome: StartOutcome =
        session === null
          ? { kind: 'refused', cause: 'other', reason: 'no such session' }
          : runSession(session);

      return Promise.resolve(outcome);
    },
    stop: (attempt) => {
      calls.push({ method: 'stop', subject: attempt.id });

      const failure = takeFailure('stop');
      const session = findSession(attempt);

      if (failure !== null) {
        return Promise.resolve({ kind: failure.kind, reason: failure.reason });
      }

      if (session === null) {
        return Promise.resolve({ kind: 'absent' });
      }

      if (session.state === 'running') {
        Object.assign(session, { state: 'suspended', asked: true });
      }

      return Promise.resolve({ kind: 'stopped' });
    },
    forget: (id) => {
      calls.push({ method: 'forget', subject: id });

      const failure = takeFailure('forget');

      if (failure !== null) {
        return Promise.resolve({ kind: failure.kind, reason: failure.reason });
      }

      return Promise.resolve({ kind: sessions.delete(id) ? 'forgotten' : 'absent' });
    },
    resumeKept: (kept, request) => {
      calls.push({ method: 'resumeKept', subject: request.idempotencyKey });

      const failure = takeFailure('resumeKept');
      const session = sessions.get(kept.atcSession) ?? null;

      if (failure !== null) {
        return Promise.resolve(failure);
      }

      if (session === null) {
        return Promise.resolve({ kind: 'refused', cause: 'other', reason: 'no such session' });
      }

      byAttempt.set(request.idempotencyKey, session.id);

      return Promise.resolve(runSession(session));
    },
    setSession: (attempt, update) => {
      const id = byAttempt.get(attempt);
      const session = (id === undefined ? null : sessions.get(id)) ?? createSession();

      byAttempt.set(attempt, session.id);

      match(update)
        .with({ state: 'absent' }, () => {
          sessions.delete(session.id);
        })
        .with({ state: 'running' }, (running) => {
          Object.assign(session, { ...running, state: 'running' });
        })
        .with({ state: 'suspended' }, (suspended) => {
          Object.assign(session, { asked: false, ...suspended, state: 'suspended' });
        })
        .with({ state: 'ended' }, (ended) => {
          Object.assign(session, { ...ended, state: 'ended' });
        })
        .exhaustive();
    },
    failNext: (method, failure) => {
      once.set(method, failure);
    },
    failAlways: (method, failure) => {
      always.set(method, failure);
    },
  };
}

function toReading(session: Session | null): SessionReading {
  if (session === null) {
    return { kind: 'absent' };
  }

  return match(session.state)
    .returnType<SessionReading>()
    .with('running', () => ({
      kind: 'running',
      atcSession: session.id,
      agentSession: session.agentSession,
      caller: { issuer: 'https://fake-worker.test', subject: session.id },
      attention: session.attention,
      lastActivityAt: session.lastActivityAt,
      lastOwnerAt: session.lastOwnerAt,
      usageLimitResetsAt: session.usageLimitResetsAt,
    }))
    .with('suspended', () => ({
      kind: 'suspended',
      atcSession: session.id,
      agentSession: session.agentSession,
      asked: session.asked,
    }))
    .with('ended', () => ({
      kind: 'ended',
      atcSession: session.id,
      agentSession: session.agentSession,
    }))
    .exhaustive();
}
