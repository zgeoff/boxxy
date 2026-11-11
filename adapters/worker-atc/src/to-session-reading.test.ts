import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockAtcSessionRead } from './test-utils/build-mock-atc-session-read.ts';
import { toSessionReading } from './to-session-reading.ts';

test('it reads a running agent process as a running session with its times and caller', () => {
  const read = buildMockAtcSessionRead({
    lastActivityAt: 2_000_000,
    session: { lastAttachedAt: 1_500_000 },
  });

  expect(toSessionReading(read)).toStrictEqual({
    kind: 'running',
    atcSession: brandSchemas.atcSessionId.parse('s1-mock'),
    agentSession: brandSchemas.agentSessionId.parse('agent-mock'),
    caller: { issuer: 'https://broker.test', subject: 's1-mock' },
    attention: 'working',
    lastActivityAt: brandSchemas.instant.parse(2_000_000),
    lastOwnerAt: brandSchemas.instant.parse(1_500_000),
    usageLimitResetsAt: null,
  });
});

test.each([
  ['running', 'working'],
  ['needs_you', 'needs-input'],
  ['done', 'turn-ended'],
] as const)('it reads the atc state %s of a running process as %s', (state, attention) => {
  const read = buildMockAtcSessionRead({ session: { state } });

  expect(toSessionReading(read)).toMatchObject({ kind: 'running', attention });
});

test('it takes the owner attach as the last activity when it is later than the last event', () => {
  const read = buildMockAtcSessionRead({
    lastActivityAt: 1_200_000,
    session: { lastAttachedAt: 1_800_000 },
  });

  expect(toSessionReading(read)).toMatchObject({ lastActivityAt: 1_800_000 });
});

test.each([
  ['the reset time', { seenAt: 1_100_000, resetsAt: 9_000_000 }, 9_000_000],
  [
    'the time the limit was seen when no reset time is known',
    { seenAt: 1_100_000, resetsAt: null },
    1_100_000,
  ],
])('it reads a usage limit as %s', (_case, usageLimit, resetsAt) => {
  const read = buildMockAtcSessionRead({ session: { usageLimit } });

  expect(toSessionReading(read)).toMatchObject({ usageLimitResetsAt: resetsAt });
});

test('it reads a session with no reported caller and no agent session with both null', () => {
  const read = buildMockAtcSessionRead();
  const { caller: _, agentSessionID: __, ...session } = read.session;

  expect(toSessionReading({ ...read, session })).toMatchObject({
    caller: null,
    agentSession: null,
  });
});

test.each([
  ['sleep', true],
  ['stop', true],
  ['run', false],
] as const)(
  'it reads a suspended process with the desired state %s as asked: %s',
  (desired, asked) => {
    const read = buildMockAtcSessionRead({
      session: { state: 'exited', lifecycle: { harness: 'suspended', vm: 'asleep', desired } },
    });

    expect(toSessionReading(read)).toStrictEqual({
      kind: 'suspended',
      atcSession: brandSchemas.atcSessionId.parse('s1-mock'),
      agentSession: brandSchemas.agentSessionId.parse('agent-mock'),
      asked,
    });
  },
);

test('it reads an exited process as ended', () => {
  const read = buildMockAtcSessionRead({
    session: { state: 'exited', lifecycle: { harness: 'exited', desired: 'stop' } },
  });

  expect(toSessionReading(read)).toStrictEqual({
    kind: 'ended',
    atcSession: brandSchemas.atcSessionId.parse('s1-mock'),
    agentSession: brandSchemas.agentSessionId.parse('agent-mock'),
  });
});
