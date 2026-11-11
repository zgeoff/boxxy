import type { Attention, Instant, SessionReading } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { match } from 'ts-pattern';
import { findCallerIdentity } from './find-caller-identity.ts';
import type { AtcSession, AtcSessionRead } from './types.ts';

// atc lists a session as `exited` whenever its agent process is not running, a process asleep
// inside its host included, so the reading comes from the harness layer of the lifecycle.
export function toSessionReading(read: AtcSessionRead): SessionReading {
  const session = read.session;
  const atcSession = brandSchemas.atcSessionId.parse(session.id);

  const agentSession =
    session.agentSessionID === undefined
      ? null
      : brandSchemas.agentSessionId.parse(session.agentSessionID);

  return (
    match(session.lifecycle.harness)
      .returnType<SessionReading>()
      .with('running', () => ({
        kind: 'running',
        atcSession,
        agentSession,
        caller: findCallerIdentity(session),
        attention: toAttention(session.state),
        lastActivityAt: toInstant(Math.max(read.lastActivityAt, session.lastAttachedAt)),
        lastOwnerAt: toInstant(session.lastAttachedAt),
        usageLimitResetsAt: findUsageLimitResetsAt(session),
      }))

      // `desired` is `run` only when the host slept by itself, with nobody asking
      .with('suspended', () => ({
        kind: 'suspended',
        atcSession,
        agentSession,
        asked: session.lifecycle.desired !== 'run',
      }))
      .with('exited', () => ({ kind: 'ended', atcSession, agentSession }))
      .exhaustive()
  );
}

// `done`: the turn ended and the session waits for a prompt. `exited` never comes with a running
// process, and reads as working.
function toAttention(state: AtcSession['state']): Attention {
  return match(state)
    .returnType<Attention>()
    .with('running', 'exited', () => 'working')
    .with('needs_you', () => 'needs-input')
    .with('done', () => 'turn-ended')
    .exhaustive();
}

function toInstant(timeMs: number): Instant {
  return brandSchemas.instant.parse(timeMs);
}

// the reset time, or the time atc saw the limit when the agent showed no reset time
function findUsageLimitResetsAt(session: AtcSession): Instant | null {
  const limit = session.usageLimit ?? null;

  return limit === null ? null : toInstant(limit.resetsAt ?? limit.seenAt);
}
