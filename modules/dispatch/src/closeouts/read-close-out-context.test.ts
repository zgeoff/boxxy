import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadVerifyRules } from '../test-utils/load-verify-rules.ts';
import { readCloseOutContext } from './read-close-out-context.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  dispatch.setRules(
    loadVerifyRules({
      session: 'fresh',
      resume: false,
      gates: {
        criterionTags: ['prod', 'qa'],
        verify: ['      criteria: { tagged: qa }', '      skip: next'],
      },
    }),
  );

  return dispatch;
}

test('it gives a gated step the acceptance lines that carry its tag alone', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({
    phase: brandSchemas.phaseName.parse('verify'),
    acceptance: [
      {
        id: brandSchemas.criterionId.parse('a1'),
        text: 'The qa line holds',
        evidence: [],
        tags: ['qa'],
      },
      {
        id: brandSchemas.criterionId.parse('a2'),
        text: 'The prod line holds',
        evidence: [],
        tags: ['prod'],
      },
    ],
  });

  const claim = await ctx.claim();

  invariant(claim !== null, 'the verify claims');

  const attempt = await ctx.readAttempt(claim.attempt.id);

  const context = await ctx.store.exclusive((tx) =>
    readCloseOutContext(tx, attempt, ctx.rules(), ctx.clock.now()),
  );

  const lines: unknown = context.item.acceptance.map((line) => line.id);

  expect(lines).toStrictEqual(['a1']);
});
