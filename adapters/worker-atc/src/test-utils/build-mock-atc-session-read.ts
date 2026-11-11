import { toAgentSessionID, toDaemonID, toSessionID } from '@atcx/contract';
import type { AtcSession, AtcSessionRead } from '../types.ts';

type MockSession = Partial<Omit<AtcSession, 'lifecycle'>> & {
  readonly lifecycle?: Partial<AtcSession['lifecycle']>;
};

// `session.get`'s answer for a session whose agent runs and works on an imp target.
export function buildMockAtcSessionRead(
  overrides: Partial<Omit<AtcSessionRead, 'session'>> & { readonly session?: MockSession } = {},
): AtcSessionRead {
  const { session = {}, ...read } = overrides;
  const { lifecycle = {}, ...fields } = session;

  return {
    session: {
      id: toSessionID('s1-mock'),
      name: 'boxxy/mock-attempt',
      cwd: '/tmp/boxxy-test/repo',
      state: 'running',
      unread: false,
      lastMsg: '',
      agentSessionID: toAgentSessionID('agent-mock'),
      agent: 'claude',
      pinned: false,
      lastAttachedAt: 1_000_000,
      repoRoot: '/tmp/boxxy-test/repo',
      namedBy: 'user',
      createdAt: 1_000_000,
      kind: 'pty',
      alive: true,
      canEject: false,
      locator: { daemonID: toDaemonID('mock-daemon'), targetID: 'box' },
      host: { name: 'imp-mock', id: 'imp-id-mock', issuer: 'https://broker.test' },
      ...fields,
      lifecycle: {
        desired: 'run',
        vm: 'awake',
        harness: 'running',
        attachment: 'detached',
        ...lifecycle,
      },
    },
    prompt: null,
    lastActivityAt: 1_000_000,
    pending: null,
    result: null,
    sessionRecord: null,
    ...read,
  };
}
