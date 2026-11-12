import type { AtcSession, AtcSessionRead } from '../types.ts';

type MockSession = Partial<Omit<AtcSession, 'lifecycle'>> & {
  readonly lifecycle?: Partial<AtcSession['lifecycle']>;
};

// `atc_session_get`'s parsed result for a session whose agent runs and works on an imp target.
export function buildMockAtcSessionRead(
  overrides: Partial<Omit<AtcSessionRead, 'session'>> & { readonly session?: MockSession } = {},
): AtcSessionRead {
  const { session = {}, ...read } = overrides;
  const { lifecycle = {}, ...fields } = session;

  return {
    session: {
      id: 's1-mock',
      name: 'boxxy/mock-attempt',
      createdAt: 1_000_000,
      state: 'running',
      agentSessionID: 'agent-mock',
      lastAttachedAt: 1_000_000,
      host: { name: 'imp-mock', id: 'imp-id-mock', issuer: 'https://broker.test' },
      ...fields,
      lifecycle: { desired: 'run', harness: 'running', ...lifecycle },
    },
    lastActivityAt: 1_000_000,
    ...read,
  };
}
