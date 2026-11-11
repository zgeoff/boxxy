import type {
  AtcSessionId,
  AttemptRow,
  SessionReading,
  StartOutcome,
  WorkerKind,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { findCallerIdentity } from './find-caller-identity.ts';
import { isCapacityRefusal } from './is-capacity-refusal.ts';
import { isFolderTrusted } from './is-folder-trusted.ts';
import { parseAtcError } from './parse-atc-error.ts';
import { toSessionReading } from './to-session-reading.ts';
import type { AtcClient, AtcSession } from './types.ts';

interface AtcWorkerInput {
  readonly client: AtcClient;

  // by worker target: the folders that the agent on the target trusts, each with its subfolders
  readonly trustedFolders: Readonly<Record<string, readonly string[]>>;
}

// The worker port on atc. Every call reaches atc through the client; a refusal that carries an atc
// code answers `refused`, and a call that got no atc answer answers `unknown`.
export function createAtcWorker(input: AtcWorkerInput): WorkerKind {
  const client = input.client.session;

  // a spawn whose answer was lost leaves the attempt with no session, which carries its spawn name
  const readSessionID = async (attempt: AttemptRow): Promise<AtcSessionId | null> => {
    if (attempt.atcSession !== null) {
      return attempt.atcSession;
    }

    const listed = await client.list({});

    return findNamedSession(listed.sessions, `boxxy/${attempt.id}`);
  };

  const readSession = async (session: AtcSessionId): Promise<SessionReading> => {
    try {
      const read = await client.get({ session });

      return toSessionReading(read);
    } catch (error) {
      if (parseAtcError(error)?.code === 'no_such_session') {
        return { kind: 'absent' };
      }

      throw error;
    }
  };

  // wakes a stopped session; a session that runs already answers as it is
  const resumeSession = async (session: AtcSessionId): Promise<StartOutcome> => {
    try {
      const read = await client.get({ session });

      if (read.session.lifecycle.harness === 'running') {
        return toStarted(read.session);
      }

      await client.adopt({ session });

      const adopted = await client.get({ session });

      return toStarted(adopted.session);
    } catch (error) {
      return toStartFailure(error);
    }
  };

  return {
    start: async (request) => {
      if (!isFolderTrusted(input.trustedFolders[request.target] ?? [], request.cwd)) {
        return { kind: 'refused', cause: 'other', reason: 'worker folder not trusted' };
      }

      try {
        const answer = await client.spawn({
          target: request.target,
          cwd: request.cwd,
          name: request.name,
          prompt: request.prompt,
          agent: request.agent,
          model: request.model,
          effort: request.effort,
          idempotencyKey: request.idempotencyKey,
        });

        return toStarted(answer.session);
      } catch (error) {
        // after a daemon restart, a keyed spawn that ran answers this until the fleet restore
        // lists its session
        if (parseAtcError(error)?.code === 'no_such_session') {
          return { kind: 'unknown', reason: 'the spawn ran, and its session is not listed yet' };
        }

        return toStartFailure(error);
      }
    },
    reconcile: async (attempt) => {
      const session = await readSessionID(attempt);

      return session === null ? { kind: 'absent' } : readSession(session);
    },
    suspend: async (attempt, ifIdleSince) => {
      try {
        const session = await readSessionID(attempt);

        if (session === null) {
          return { kind: 'refused', reason: 'no such session' };
        }

        const read = await client.get({ session });

        const reading = toSessionReading(read);

        if (reading.kind !== 'running') {
          return { kind: 'suspended' };
        }

        if (ifIdleSince !== null && reading.lastActivityAt > ifIdleSince) {
          return { kind: 'active' };
        }

        // a plain kill of a session that already exited forgets it, so every kill is stop-only
        await client.kill({ session, stopOnly: true });

        return { kind: 'suspended' };
      } catch (error) {
        return toCallFailure(error);
      }
    },
    resume: async (attempt) => {
      try {
        const session = await readSessionID(attempt);

        return session === null
          ? { kind: 'refused', cause: 'other', reason: 'no such session' }
          : await resumeSession(session);
      } catch (error) {
        return toStartFailure(error);
      }
    },
    stop: async (attempt) => {
      try {
        const session = await readSessionID(attempt);

        if (session === null) {
          return { kind: 'absent' };
        }

        await client.kill({ session, stopOnly: true });

        return { kind: 'stopped' };
      } catch (error) {
        return parseAtcError(error)?.code === 'no_such_session'
          ? { kind: 'absent' }
          : toCallFailure(error);
      }
    },
    forget: async (session) => {
      try {
        const first = await client.forget({ session, refuseLive: true });

        // a target that destroys its hosts answers a confirm token first, for a second call
        if ('confirmToken' in first) {
          await client.forget({ session, refuseLive: true, confirmToken: first.confirmToken });
        }

        return { kind: 'forgotten' };
      } catch (error) {
        return parseAtcError(error)?.code === 'no_such_session'
          ? { kind: 'absent' }
          : toCallFailure(error);
      }
    },
    resumeKept: async (kept, request) => {
      const woken = await resumeSession(kept.atcSession);

      if (woken.kind !== 'started') {
        return woken;
      }

      try {
        await client.message({
          session: kept.atcSession,
          text: request.prompt,
          idempotencyKey: request.idempotencyKey,
        });

        return woken;
      } catch (error) {
        // the claim spawns a fresh session in its place, so the kept one must not run on
        await client.kill({ session: kept.atcSession, stopOnly: true }).catch(() => null);

        return toStartFailure(error);
      }
    },
  };
}

// the latest session with the name
function findNamedSession(sessions: readonly AtcSession[], name: string): AtcSessionId | null {
  const latest = sessions
    .filter((session) => session.name === name)
    .toSorted((left, right) => right.createdAt - left.createdAt)
    .at(0);

  return latest === undefined ? null : brandSchemas.atcSessionId.parse(latest.id);
}

function toStarted(session: AtcSession): StartOutcome {
  return {
    kind: 'started',
    atcSession: brandSchemas.atcSessionId.parse(session.id),
    agentSession:
      session.agentSessionID === undefined
        ? null
        : brandSchemas.agentSessionId.parse(session.agentSessionID),
    caller: findCallerIdentity(session),
  };
}

function toStartFailure(error: unknown): StartOutcome {
  const atcError = parseAtcError(error);
  const failure = toCallFailure(error);

  if (failure.kind === 'unknown' || atcError === null) {
    return { kind: 'unknown', reason: failure.reason };
  }

  return {
    kind: 'refused',
    cause: isCapacityRefusal(atcError) ? 'capacity' : 'other',
    reason: failure.reason,
  };
}

// atc may or may not have run a call it answers `outcome_unknown` or `idempotency_key_unknown`
function toCallFailure(error: unknown): {
  readonly kind: 'refused' | 'unknown';
  readonly reason: string;
} {
  const atcError = parseAtcError(error);

  if (atcError === null) {
    return { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) };
  }

  const reason = `${atcError.code}: ${atcError.message}`;

  const unknown =
    atcError.code === 'outcome_unknown' || atcError.code === 'idempotency_key_unknown';

  return { kind: unknown ? 'unknown' : 'refused', reason };
}
