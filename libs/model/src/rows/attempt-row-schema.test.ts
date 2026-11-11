import { expect, test } from 'bun:test';
import { attemptRowSchema } from './attempt-row-schema.ts';

test('it accepts a sleeping attended design attempt with its close-out', () => {
  const row = {
    id: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    phase: 'design',
    number: 1,
    runner: 'runner-1',
    recipeHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    rulesVersion: '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
    pool: 'main',
    leaseGen: 1,
    spawnRequest: { prompt: 'Design the retry button' },
    spawnRequestHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    state: 'sleeping',
    failure: null,
    atcSession: 'sess-01',
    caller: { issuer: 'https://issuer.example.test', subject: 'session-41' },
    claimedAt: 1000,
    startedAt: 2000,
    endedAt: null,
    fields: { designMode: ['attended'] },
    mode: 'attended',
    round: 1,
    input: { acceptance: [] },
    holdGen: 2,
    closeOut: null,
    closeOutHash: null,
    closeOutFact: null,
    closing: null,
    closingAt: null,
    suspendRequestedAt: 3000,
    sleptAt: 4000,
    wakeRequestedAt: null,
    wokenAt: null,
    outcome: null,
    returnedOutcome: null,
    strayedAt: null,
    sessionStoppedAt: null,
    sessionForgottenAt: null,
  };

  const parsed: unknown = attemptRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects an attempt in a state the store never writes', () => {
  expect(attemptRowSchema.safeParse({ state: 'paused' }).error?.issues).toPartiallyContain({
    path: ['state'],
  });
});
