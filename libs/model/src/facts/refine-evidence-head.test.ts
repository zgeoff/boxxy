import { expect, test } from 'bun:test';
import { z } from 'zod';
import { refineEvidenceHead } from './refine-evidence-head.ts';
import { workFactSchemas } from './work-fact-schemas.ts';

function setupTest() {
  const head = '9c1e0f5a2b3c4d5e6f708192a3b4c5d6e7f80910';

  return {
    head,
    schema: refineEvidenceHead(workFactSchemas['boxxy.evidence.recorded']),
    wireSchema: refineEvidenceHead(
      workFactSchemas['boxxy.evidence.recorded'].extend({ storeVersion: z.number().int() }),
    ),
    build: (fields: Record<string, unknown>) => ({
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      ref: 'pr / checks',
      observed: null,
      ...fields,
    }),
  };
}

test.each(['check', 'verdict'])('it accepts a %s fact with a head', (kind) => {
  const ctx = setupTest();

  expect(ctx.schema.safeParse(ctx.build({ kind, head: ctx.head })).success).toBe(true);
});

test.each(['check', 'verdict'])('it rejects a %s fact with no head', (kind) => {
  const ctx = setupTest();

  expect(ctx.schema.safeParse(ctx.build({ kind })).error?.issues).toPartiallyContain({
    path: ['head'],
  });
});

test.each(['pull_request', 'commit', 'test', 'ci-run', 'live-check'])(
  'it rejects a %s fact with a head',
  (kind) => {
    const ctx = setupTest();

    expect(
      ctx.schema.safeParse(ctx.build({ kind, head: ctx.head })).error?.issues,
    ).toPartiallyContain({ path: ['head'] });
  },
);

test.each(['pull_request', 'commit', 'test', 'ci-run', 'live-check'])(
  'it accepts a %s fact stored with no head',
  (kind) => {
    const ctx = setupTest();

    expect(ctx.schema.safeParse(ctx.build({ kind })).success).toBe(true);
  },
);

test('it rejects a head that is not a commit SHA', () => {
  const ctx = setupTest();

  expect(ctx.schema.safeParse(ctx.build({ kind: 'check', head: 'main' })).success).toBe(false);
});

test('it keeps the rule after the wire schema adds a store version', () => {
  const ctx = setupTest();

  expect([
    ctx.wireSchema.safeParse(ctx.build({ kind: 'check', storeVersion: 1 })).success,
    ctx.wireSchema.safeParse(ctx.build({ kind: 'check', head: ctx.head, storeVersion: 1 })).success,
  ]).toStrictEqual([false, true]);
});
