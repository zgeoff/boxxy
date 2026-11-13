// A valid input of a session or hook procedure: one that names the attempt, or an item for the
// read of one item; `{}` for any other.
export function buildSessionInput(procedure: string, attempt: string): unknown {
  const session = { attempt };

  const inputs: Readonly<Record<string, unknown>> = {
    'attempt.getItem': { item: 'i-1' },
    'attempt.evidence': { session, kind: 'test', ref: 'bun test' },
    'attempt.closeOut': { session, closeOut: {} },
    'attempt.bindSession': {
      session: { attempt, agentSession: 'agent-1', product: 'claude_code' },
      seenAt: '2026-11-01T09:00:00Z',
    },
    'attempt.recordPullRequest': { session, url: 'https://github.com/example/app/pull/7' },
  };

  return inputs[procedure] ?? {};
}
