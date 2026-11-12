import type { Clock } from '@boxxy/model';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { AtcToolName } from '../types.ts';

// How a target treats a stopped session's host: a `local` target ends the agent process, and a
// `suspending` target sleeps the host with the process inside, and destroys it on a forget.
export type FakeTargetKind = 'local' | 'suspending';

type Harness = 'running' | 'suspended' | 'exited';

type Desired = 'run' | 'sleep' | 'stop';

// What a tool call answers: a structured result, a refusal as atc writes it, or a result of any
// shape.
export type FakeAtcAnswer =
  | { readonly kind: 'result'; readonly result: Readonly<Record<string, unknown>> }
  | { readonly kind: 'refusal'; readonly code: string }
  | { readonly kind: 'malformed'; readonly result: Readonly<Record<string, unknown>> };

// A failure the gateway answers in place of the tool: `no-answer` is HTTP 502, and `rpc-error`
// is a JSON-RPC error with the code.
export type FakeGatewayFailure =
  | { readonly kind: 'no-answer' }
  | { readonly kind: 'rpc-error'; readonly code: number };

export type FakeAtcFailure =
  | Exclude<FakeAtcAnswer, { readonly kind: 'result' }>
  | FakeGatewayFailure;

// What a test changes on a listed session. A field left out keeps the session's value.
export interface FakeSessionPatch {
  readonly lastAttachedAt?: number;
  readonly lastActivityAt?: number;
  readonly harness?: Harness;
  readonly desired?: Desired;
  readonly host?: Readonly<Record<string, string>>;
}

export interface FakeAtc {
  // every tool call atc took, in order, with its arguments
  readonly calls: readonly { readonly tool: AtcToolName; readonly args: unknown }[];
  readonly answer: (tool: AtcToolName, args: unknown) => FakeAtcAnswer;

  // once, the gateway failure that the next failure of the tool sets; null for any other call
  readonly takeGatewayFailure: (tool: AtcToolName, args: unknown) => FakeGatewayFailure | null;

  // the text of each message sent to the session, in order
  readonly listMessages: (session: string) => readonly string[];
  readonly patchSession: (session: string, patch: FakeSessionPatch) => void;

  // the next call of the tool answers the failure and changes nothing
  readonly failNext: (tool: AtcToolName, failure: FakeAtcFailure) => void;
}

interface FakeSession {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
  readonly target: string;
  readonly targetKind: FakeTargetKind;
  readonly createdAt: number;
  readonly agentSessionID: string;
  harness: Harness;
  desired: Desired;
  lastAttachedAt: number;
  lastActivityAt: number;
  host: Readonly<Record<string, string>>;
  readonly messages: string[];
  readonly messageKeys: Map<string, string>;
}

interface FakeAtcInput {
  readonly clock: Clock;
  readonly targets: Readonly<Record<string, FakeTargetKind>>;
}

const sessionArgs = z.object({ session: z.string() });

const spawnArgs = z.object({
  target: z.string(),
  cwd: z.string(),
  name: z.string(),
  idempotencyKey: z.string().optional(),
});

const forgetArgs = z.object({ session: z.string(), confirmToken: z.string().optional() });

const messageArgs = z.object({
  session: z.string(),
  text: z.string(),
  idempotencyKey: z.string().optional(),
});

// An atc daemon in memory, with atc's MCP tool names and result shapes. Each session runs on the
// host `imp-<session ID>`, with the issuer `https://broker.test`.
export function createFakeAtc(input: FakeAtcInput): FakeAtc {
  const sessions = new Map<string, FakeSession>();
  const spawnKeys = new Map<string, string>();
  const confirmTokens = new Map<string, string>();
  const failures = new Map<AtcToolName, FakeAtcFailure>();

  const calls: { tool: AtcToolName; args: unknown }[] = [];
  let count = 0;

  const spawn = (args: unknown): FakeAtcAnswer => {
    const spawned = spawnArgs.parse(args);
    const known = sessions.get(spawnKeys.get(spawned.idempotencyKey ?? '') ?? '');

    if (known !== undefined) {
      return buildResult(buildDescriptor(known));
    }

    const targetKind = input.targets[spawned.target];

    if (targetKind === undefined) {
      return buildRefusal('target_forbidden');
    }

    count += 1;

    const id = `s${count}-fake`;
    const now = input.clock.now();

    const session: FakeSession = {
      id,
      name: spawned.name,
      cwd: spawned.cwd,
      target: spawned.target,
      targetKind,
      createdAt: now,
      agentSessionID: `agent-${count}`,
      harness: 'running',
      desired: 'run',
      lastAttachedAt: now,
      lastActivityAt: now,
      host: { name: `imp-${id}`, id: `imp-id-${id}`, issuer: 'https://broker.test' },
      messages: [],
      messageKeys: new Map(),
    };

    sessions.set(id, session);

    if (spawned.idempotencyKey !== undefined) {
      spawnKeys.set(spawned.idempotencyKey, id);
    }

    return buildResult(buildDescriptor(session));
  };

  const withSession = (
    args: unknown,
    work: (session: FakeSession) => FakeAtcAnswer,
  ): FakeAtcAnswer => {
    const session = sessions.get(sessionArgs.parse(args).session);

    return session === undefined ? buildRefusal('no_such_session') : work(session);
  };

  // a stop of a session that already exited changes nothing and stays listed
  const stop = (session: FakeSession): FakeAtcAnswer => {
    if (session.harness !== 'running') {
      return buildResult({ stopped: false });
    }

    session.harness = session.targetKind === 'local' ? 'exited' : 'suspended';
    session.desired = session.targetKind === 'local' ? 'stop' : 'sleep';

    return buildResult({ stopped: true });
  };

  // atc refuses an adopt of a session that runs with the code of an unknown session
  const adopt = (args: unknown): FakeAtcAnswer => {
    const session = sessions.get(sessionArgs.parse(args).session);

    if (session === undefined) {
      return buildRefusal('session_dead');
    }

    if (session.harness === 'running') {
      return buildRefusal('no_such_session');
    }

    session.harness = 'running';
    session.desired = 'run';
    session.lastActivityAt = input.clock.now();

    return buildResult({ adopted: true });
  };

  // a target that destroys its hosts takes two calls: the first answers a confirm token
  const forget = (args: unknown): FakeAtcAnswer => {
    const forgot = forgetArgs.parse(args);

    return withSession(args, (session) => {
      if (session.harness === 'running') {
        return buildRefusal('session_live');
      }

      if (session.targetKind === 'suspending' && forgot.confirmToken === undefined) {
        confirmTokens.set(`confirm-${session.id}`, session.id);

        return buildResult({
          confirmToken: `confirm-${session.id}`,
          expiresAt: input.clock.now() + 60_000,
        });
      }

      if (
        session.targetKind === 'suspending' &&
        confirmTokens.get(forgot.confirmToken ?? '') !== session.id
      ) {
        return buildRefusal('confirm_token_invalid');
      }

      sessions.delete(session.id);

      return buildResult({
        forgotten: true,
        destroyed: session.targetKind === 'suspending',
        workspace: { outcome: 'none' },
      });
    });
  };

  const message = (args: unknown): FakeAtcAnswer => {
    const sent = messageArgs.parse(args);

    return withSession(args, (session) => {
      if (session.harness !== 'running') {
        return buildRefusal('session_dead');
      }

      const known = session.messageKeys.get(sent.idempotencyKey ?? '');
      const id = known ?? `m${session.messages.length + 1}-${session.id}`;

      if (known === undefined) {
        session.messages.push(sent.text);

        session.lastActivityAt = input.clock.now();
      }

      if (sent.idempotencyKey !== undefined) {
        session.messageKeys.set(sent.idempotencyKey, id);
      }

      return buildResult({ message: id, status: 'queued' });
    });
  };

  const run = (tool: AtcToolName, args: unknown): FakeAtcAnswer =>
    match(tool)
      .returnType<FakeAtcAnswer>()
      .with('atc_sessions_list', () =>
        buildResult({
          sessions: [...sessions.values()].map((session) => buildDescriptor(session)),
        }),
      )
      .with('atc_session_get', () =>
        withSession(args, (session) =>
          buildResult({
            session: buildDescriptor(session),
            prompt: null,
            lastActivityAt: session.lastActivityAt,
            pending: null,
            result: null,
            sessionRecord: null,
          }),
        ),
      )
      .with('atc_session_spawn', () => spawn(args))
      .with('atc_session_stop', () => withSession(args, stop))
      .with('atc_session_adopt', () => adopt(args))
      .with('atc_session_forget', () => forget(args))
      .with('atc_message_send', () => message(args))
      .exhaustive();

  return {
    calls,
    answer: (tool, args) => {
      calls.push({ tool, args });

      const failure = failures.get(tool);

      if (failure?.kind === 'refusal' || failure?.kind === 'malformed') {
        failures.delete(tool);

        return failure;
      }

      return run(tool, args);
    },
    takeGatewayFailure: (tool, args) => {
      const failure = failures.get(tool);

      if (failure?.kind !== 'no-answer' && failure?.kind !== 'rpc-error') {
        return null;
      }

      failures.delete(tool);
      calls.push({ tool, args });

      return failure;
    },
    listMessages: (session) => sessions.get(session)?.messages ?? [],
    patchSession: (id, patch) => {
      const session = sessions.get(id);

      if (session === undefined) {
        throw new Error(`the fake atc lists no session ${id}`);
      }

      session.lastAttachedAt = patch.lastAttachedAt ?? session.lastAttachedAt;
      session.lastActivityAt = patch.lastActivityAt ?? session.lastActivityAt;
      session.harness = patch.harness ?? session.harness;
      session.desired = patch.desired ?? session.desired;
      session.host = patch.host ?? session.host;
    },
    failNext: (tool, failure) => {
      failures.set(tool, failure);
    },
  };
}

function buildResult(result: Readonly<Record<string, unknown>>): FakeAtcAnswer {
  return { kind: 'result', result };
}

// The session entry as atc sends it, with the fields boxxy does not read.
function buildDescriptor(session: FakeSession): Readonly<Record<string, unknown>> {
  const local = session.targetKind === 'local';

  return {
    id: session.id,
    name: session.name,
    cwd: session.cwd,
    agent: 'claude',
    state: session.harness === 'running' ? 'running' : 'exited',
    unread: false,
    pinned: false,
    alive: session.harness === 'running',
    kind: 'pty',
    lastMsg: '',
    createdAt: session.createdAt,
    agentSessionID: session.agentSessionID,
    lastAttachedAt: session.lastAttachedAt,
    repoRoot: session.cwd,
    namedBy: 'user',
    canEject: false,
    locator: { daemonID: 'fake-daemon', targetID: session.target },
    lifecycle: {
      desired: session.desired,
      vm: local ? 'none' : 'awake',
      harness: session.harness,
      attachment: local ? 'local' : 'detached',
    },
    host: session.host,
  };
}

function buildRefusal(code: string): FakeAtcAnswer {
  return { kind: 'refusal', code };
}
