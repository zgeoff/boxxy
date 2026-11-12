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
import { AtcCallError } from './mcp/atc-call-error.ts';
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
  const client = input.client;

  // a spawn whose answer was lost leaves the attempt with no session, which carries its spawn name
  const readSessionID = async (attempt: AttemptRow): Promise<AtcSessionId | null> => {
    if (attempt.atcSession !== null) {
      return attempt.atcSession;
    }

    const listed = await client.listSessions();

    return findNamedSession(listed.sessions, `boxxy/${attempt.id}`);
  };

  const readSession = async (session: AtcSessionId): Promise<SessionReading> => {
    try {
      const read = await client.readSession(session);

      return toSessionReading(read);
    } catch (error) {
      if (isAtcRefusal(error, 'no_such_session')) {
        return { kind: 'absent' };
      }

      throw error;
    }
  };

  // wakes a stopped session; a session that runs already answers as it is
  const resumeSession = async (session: AtcSessionId): Promise<StartOutcome> => {
    try {
      const read = await client.readSession(session);

      if (read.session.lifecycle.harness === 'running') {
        return toStarted(read.session);
      }

      await client.adoptSession(session);

      const adopted = await client.readSession(session);

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
        const session = await client.spawnSession({
          target: request.target,
          cwd: request.cwd,
          name: request.name,
          prompt: request.prompt,
          agent: request.agent,
          model: request.model,
          effort: request.effort,
          idempotencyKey: request.idempotencyKey,
        });

        return toStarted(session);
      } catch (error) {
        // after a daemon restart, a keyed spawn that ran answers this until the fleet restore
        // lists its session
        if (isAtcRefusal(error, 'no_such_session')) {
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

        const read = await client.readSession(session);

        const reading = toSessionReading(read);

        if (reading.kind !== 'running') {
          return { kind: 'suspended' };
        }

        if (ifIdleSince !== null && reading.lastActivityAt > ifIdleSince) {
          return { kind: 'active' };
        }

        await client.stopSession(session);

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

        await client.stopSession(session);

        return { kind: 'stopped' };
      } catch (error) {
        return isAtcRefusal(error, 'no_such_session') ? { kind: 'absent' } : toCallFailure(error);
      }
    },
    forget: async (session) => {
      try {
        // atc refuses a forget of a live session, so a forget never stops one that runs
        const first = await client.forgetSession({ session });

        // a target that destroys its hosts answers a confirm token first, for a second call
        if ('confirmToken' in first) {
          await client.forgetSession({ session, confirmToken: first.confirmToken });
        }

        return { kind: 'forgotten' };
      } catch (error) {
        return isAtcRefusal(error, 'no_such_session') ? { kind: 'absent' } : toCallFailure(error);
      }
    },
    resumeKept: async (kept, request) => {
      const woken = await resumeSession(kept.atcSession);

      if (woken.kind !== 'started') {
        return woken;
      }

      try {
        await client.sendMessage({
          session: kept.atcSession,
          text: request.prompt,
          idempotencyKey: request.idempotencyKey,
        });

        return woken;
      } catch (error) {
        // the claim spawns a fresh session in its place, so the kept one must not run on
        await client.stopSession(kept.atcSession).catch(() => null);

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

function isAtcRefusal(error: unknown, code: string): boolean {
  return error instanceof AtcCallError && error.code === code;
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
  const failure = toCallFailure(error);

  if (failure.kind === 'unknown') {
    return { kind: 'unknown', reason: failure.reason };
  }

  const capacity = error instanceof AtcCallError && isCapacityRefusal(error);

  return { kind: 'refused', cause: capacity ? 'capacity' : 'other', reason: failure.reason };
}

// atc may or may not have run a call it answers `outcome_unknown` or `idempotency_key_unknown`
function toCallFailure(error: unknown): {
  readonly kind: 'refused' | 'unknown';
  readonly reason: string;
} {
  if (!(error instanceof AtcCallError)) {
    return { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) };
  }

  const reason = `${error.code}: ${error.message}`;
  const unknown = error.code === 'outcome_unknown' || error.code === 'idempotency_key_unknown';

  return { kind: unknown ? 'unknown' : 'refused', reason };
}
