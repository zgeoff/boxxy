import { expect, test } from 'bun:test';
import { wireFactSchemas } from './wire-fact-schemas.ts';

function setupTest() {
  return {
    schema: wireFactSchemas['boxxy.evidence.recorded'],
    head: '9c1e0f5a2b3c4d5e6f708192a3b4c5d6e7f80910',
    build: (fields: Record<string, unknown>) => ({
      attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
      ref: 'src/upload.test.ts it retries an upload',
      observed: '12 pass',
      storeVersion: 3,
      ...fields,
    }),
  };
}

test('it reads an evidence fact of an old kind stored with no head', () => {
  const ctx = setupTest();
  const fact = ctx.build({ kind: 'test' });

  expect<unknown>(ctx.schema.safeParse(fact).data).toStrictEqual(fact);
});

test.each(['check', 'verdict'])('it reads a %s evidence fact with a head', (kind) => {
  const ctx = setupTest();
  const fact = ctx.build({ kind, head: ctx.head });

  expect<unknown>(ctx.schema.safeParse(fact).data).toStrictEqual(fact);
});

test('it refuses a check evidence fact whose head is not a commit SHA', () => {
  const ctx = setupTest();

  expect(
    ctx.schema.safeParse(ctx.build({ kind: 'check', head: 'not-a-sha' })).error?.issues,
  ).toPartiallyContain({ path: ['head'] });
});

test.each(['check', 'verdict'])('it refuses a %s evidence fact with no head', (kind) => {
  const ctx = setupTest();

  expect(ctx.schema.safeParse(ctx.build({ kind })).error?.issues).toPartiallyContain({
    path: ['head'],
  });
});

test('it refuses an evidence fact of an old kind that has a head', () => {
  const ctx = setupTest();

  expect(
    ctx.schema.safeParse(ctx.build({ kind: 'test', head: ctx.head })).error?.issues,
  ).toPartiallyContain({ path: ['head'] });
});
