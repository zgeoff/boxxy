import type { ErrorCode } from '@atcx/contract';
import { toAgentSessionID, toDaemonID, toSessionID } from '@atcx/contract';
import type { Clock } from '@boxxy/model';
import { z } from 'zod';
import type { AtcClient, AtcSession } from '../types.ts';

// How a target treats a stopped session's host: a `local` target ends the agent process, and a
// `suspending` target sleeps the host with the process inside, and destroys it on a forget.
export type FakeTargetKind = 'local' | 'suspending';

type FakeCall = keyof AtcClient['session'];

// What a test changes on a listed session. A field left out keeps the session's value.
export type FakeSessionPatch = Partial<
  Pick<AtcSession, 'state' | 'lastAttachedAt' | 'host' | 'agentSessionID'>
> & {
  readonly harness?: AtcSession['lifecycle']['harness'];
  readonly desired?: AtcSession['lifecycle']['desired'];
  readonly lastActivityAt?: number;
};

export interface FakeAtcClient extends AtcClient {
  // every call the client took, in order, with its input
  readonly calls: readonly { readonly call: FakeCall; readonly input: unknown }[];

  // the text of each message sent to the session, in order
  listMessages: (session: string) => readonly string[];
  patchSession: (session: string, patch: FakeSessionPatch) => void;

  // the next call of that procedure rejects with the error and changes nothing
  failNext: (call: FakeCall, error: Error) => void;
}

// A refusal as atc's client gives it: the error's `code` and `data`.
export class FakeAtcError extends Error {
  readonly code: ErrorCode;

  readonly data: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ErrorCode, data?: Readonly<Record<string, unknown>>) {
    super(`atc refused the call: ${code}`);

    this.name = 'FakeAtcError';
    this.code = code;
    this.data = data;
  }
}

interface FakeSession {
  descriptor: AtcSession;
  lastActivityAt: number;
  readonly targetKind: FakeTargetKind;
  readonly messages: string[];
  readonly messageKeys: Map<string, string>;
}

interface FakeAtcClientInput {
  readonly clock: Clock;
  readonly targets: Readonly<Record<string, FakeTargetKind>>;
}

const sessionInputSchema = z.object({ session: z.string() });

// An atc daemon in memory, as atc's docs describe the calls the worker adapter makes. Each session
// runs on the host `imp-<session ID>`, with the issuer `https://broker.test`.
export function createFakeAtcClient(input: FakeAtcClientInput): FakeAtcClient {
  const sessions = new Map<string, FakeSession>();
  const spawnKeys = new Map<string, string>();
  const confirmTokens = new Map<string, string>();
  const failures = new Map<FakeCall, Error>();

  const calls: { call: FakeCall; input: unknown }[] = [];
  let count = 0;

  // a refusal rejects the call's promise, as a remote call does
  const answer = <Answer>(
    call: FakeCall,
    callInput: unknown,
    work: () => Answer,
  ): Promise<Answer> =>
    Promise.try(() => {
      calls.push({ call, input: callInput });

      const failure = failures.get(call);

      if (failure !== undefined) {
        failures.delete(call);
        throw failure;
      }

      return work();
    });

  const getSession = (callInput: unknown): FakeSession => {
    const session = sessions.get(sessionInputSchema.parse(callInput).session);

    if (session === undefined) {
      throw new FakeAtcError('no_such_session');
    }

    return session;
  };

  const setHarness = (
    session: FakeSession,
    harness: AtcSession['lifecycle']['harness'],
    desired: AtcSession['lifecycle']['desired'],
  ): void => {
    session.descriptor = {
      ...session.descriptor,
      state: harness === 'running' ? 'running' : 'exited',
      alive: harness === 'running',
      lifecycle: { ...session.descriptor.lifecycle, harness, desired },
    };
  };

  const createSession = (spawn: Parameters<AtcClient['session']['spawn']>[0]): AtcSession => {
    const target = spawn.target ?? 'local';
    const targetKind = input.targets[target];

    if (targetKind === undefined) {
      throw new FakeAtcError('unknown_target');
    }

    count += 1;

    const id = `s${count}-fake`;
    const now = input.clock.now();

    const descriptor: AtcSession = {
      id: toSessionID(id),
      name: typeof spawn.name === 'string' ? spawn.name : '',
      cwd: spawn.cwd ?? '',
      state: 'running',
      unread: false,
      lastMsg: '',
      agentSessionID: toAgentSessionID(`agent-${count}`),
      agent: spawn.agent ?? 'claude',
      pinned: false,
      lastAttachedAt: now,
      repoRoot: spawn.cwd ?? '',
      namedBy: 'user',
      createdAt: now,
      kind: 'pty',
      alive: true,
      canEject: false,
      locator: { daemonID: toDaemonID('fake-daemon'), targetID: target },
      lifecycle: {
        desired: 'run',
        vm: targetKind === 'local' ? 'none' : 'awake',
        harness: 'running',
        attachment: targetKind === 'local' ? 'local' : 'detached',
      },
      host: { name: `imp-${id}`, id: `imp-id-${id}`, issuer: 'https://broker.test' },
    };

    sessions.set(id, {
      descriptor,
      lastActivityAt: now,
      targetKind,
      messages: [],
      messageKeys: new Map(),
    });

    return descriptor;
  };

  return {
    calls,
    session: {
      spawn: (spawn) =>
        answer('spawn', spawn, () => {
          const key = spawn.idempotencyKey;
          const known = key === undefined ? undefined : sessions.get(spawnKeys.get(key) ?? '');

          if (known !== undefined) {
            return { session: known.descriptor };
          }

          const descriptor = createSession(spawn);

          if (key !== undefined) {
            spawnKeys.set(key, descriptor.id);
          }

          return { session: descriptor };
        }),
      get: (get) =>
        answer('get', get, () => {
          const session = getSession(get);

          return {
            session: session.descriptor,
            prompt: null,
            lastActivityAt: session.lastActivityAt,
            pending: null,
            result: null,
            sessionRecord: null,
          };
        }),
      list: (list) =>
        answer('list', list, () => ({
          sessions: [...sessions.values()].map((session) => session.descriptor),
        })),

      // a plain kill of an exited session forgets it; a stop-only kill leaves it listed
      kill: (kill) =>
        answer('kill', kill, () => {
          const session = getSession(kill);

          if (session.descriptor.lifecycle.harness !== 'running') {
            if (kill.stopOnly !== true) {
              sessions.delete(session.descriptor.id);
            }

            return { stopped: false };
          }

          if (session.targetKind === 'local') {
            setHarness(session, 'exited', 'stop');
          } else {
            setHarness(session, 'suspended', 'sleep');
          }

          return { stopped: true };
        }),

      // atc refuses an adopt of a session that runs with the code of an unknown session
      adopt: (adopt) =>
        answer('adopt', adopt, () => {
          const session = sessions.get(sessionInputSchema.parse(adopt).session);

          if (session === undefined) {
            throw new FakeAtcError('session_dead');
          }

          if (session.descriptor.lifecycle.harness === 'running') {
            throw new FakeAtcError('no_such_session');
          }

          setHarness(session, 'running', 'run');

          session.lastActivityAt = input.clock.now();

          return {};
        }),

      // a target that destroys its hosts takes two calls: the first answers a confirm token
      forget: (forget) =>
        answer('forget', forget, () => {
          const session = getSession(forget);
          const id = session.descriptor.id;

          if (forget.refuseLive === true && session.descriptor.lifecycle.harness === 'running') {
            throw new FakeAtcError('session_live');
          }

          if (session.targetKind === 'suspending' && forget.confirmToken === undefined) {
            confirmTokens.set(`confirm-${id}`, id);

            return { confirmToken: `confirm-${id}`, expiresAt: input.clock.now() + 60_000 };
          }

          if (
            session.targetKind === 'suspending' &&
            confirmTokens.get(forget.confirmToken ?? '') !== id
          ) {
            throw new FakeAtcError('confirm_token_invalid');
          }

          sessions.delete(id);

          return {
            forgotten: true as const,
            destroyed: session.targetKind === 'suspending',
            workspace: { outcome: 'none' as const },
          };
        }),
      message: (message) =>
        answer('message', message, () => {
          const session = getSession(message);

          if (session.descriptor.lifecycle.harness !== 'running') {
            throw new FakeAtcError('session_dead');
          }

          const key = message.idempotencyKey;
          const known = key === undefined ? undefined : session.messageKeys.get(key);
          const id = known ?? `m${session.messages.length + 1}-${session.descriptor.id}`;

          if (known === undefined) {
            const text = typeof message.text === 'string' ? message.text : '';

            session.messages.push(text);

            session.lastActivityAt = input.clock.now();
          }

          if (key !== undefined) {
            session.messageKeys.set(key, id);
          }

          return { message: id, status: 'queued' as const };
        }),
    },
    listMessages: (session) => sessions.get(session)?.messages ?? [],
    patchSession: (id, patch) => {
      const session = sessions.get(id);

      if (session === undefined) {
        throw new FakeAtcError('no_such_session');
      }

      const { harness, desired, lastActivityAt, ...fields } = patch;

      session.descriptor = {
        ...session.descriptor,
        ...fields,
        lifecycle: {
          ...session.descriptor.lifecycle,
          harness: harness ?? session.descriptor.lifecycle.harness,
          desired: desired ?? session.descriptor.lifecycle.desired,
        },
      };

      session.lastActivityAt = lastActivityAt ?? session.lastActivityAt;
    },
    failNext: (call, error) => {
      failures.set(call, error);
    },
  };
}
