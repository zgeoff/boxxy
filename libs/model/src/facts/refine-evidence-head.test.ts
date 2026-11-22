import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { parseNewFact } from './parse-new-fact.ts';
import type { NewFact } from './types.ts';

function setupTest() {
  return {
    head: brandSchemas.commitSha.parse('9c1e0f5a2b3c4d5e6f708192a3b4c5d6e7f80910'),
    attempt: brandSchemas.attemptId.parse('0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f'),
    parse: (payload: NewFact<'boxxy.evidence.recorded'>['payload']) =>
      parseNewFact({
        id: brandSchemas.factId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
        type: 'boxxy.evidence.recorded',
        entity: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70',
        actor: 'boxxy:owner:local',
        payload,
      }),
  };
}

test.each(['check', 'verdict'] as const)('it accepts a %s fact with a head', (kind) => {
  const ctx = setupTest();

  expect(() =>
    ctx.parse({ attempt: ctx.attempt, kind, ref: 'pr / checks', observed: null, head: ctx.head }),
  ).not.toThrow();
});

test.each(['check', 'verdict'] as const)('it rejects a %s fact with no head', (kind) => {
  const ctx = setupTest();

  expect(() =>
    ctx.parse({ attempt: ctx.attempt, kind, ref: 'pr / checks', observed: null }),
  ).toThrowWithMessage(Error, /boxxy\.evidence\.recorded/u);
});

test.each(['pull_request', 'commit', 'test', 'ci-run', 'live-check'] as const)(
  'it rejects a %s fact with a head',
  (kind) => {
    const ctx = setupTest();

    expect(() =>
      ctx.parse({ attempt: ctx.attempt, kind, ref: 'ref', observed: null, head: ctx.head }),
    ).toThrowWithMessage(Error, /boxxy\.evidence\.recorded/u);
  },
);

test.each(['pull_request', 'commit', 'test', 'ci-run', 'live-check'] as const)(
  'it accepts a %s fact stored with no head',
  (kind) => {
    const ctx = setupTest();

    expect(() =>
      ctx.parse({ attempt: ctx.attempt, kind, ref: 'ref', observed: null }),
    ).not.toThrow();
  },
);
