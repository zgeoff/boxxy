import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { WaitAnswer, WaitKind } from '../rules/types.ts';
import { buildMockPipeline } from '../test-utils/build-mock-pipeline.ts';
import { buildMockV1ItemRow } from '../test-utils/build-mock-v1-item-row.ts';
import { collectWaitAnswers, pickWaitSkip } from './collect-wait-answers.ts';

function setupTest() {
  const item = buildMockV1ItemRow({ repo: brandSchemas.repoName.parse('acme/lamps') });
  const seen: string[] = [];

  const buildWait = (name: string, answer: WaitAnswer): WaitKind => ({
    name,
    after: { outcome: 'merged' },
    read: (subject, repo) => {
      seen.push(`${name} ${subject.mergeCommit ?? 'no commit'} ${JSON.stringify(repo.ships)}`);

      return answer;
    },
  });

  const step = buildMockPipeline({
    phases: ['review'],
    steps: { review: { waits: ['one', 'two'] } },
  }).steps.at(0);

  return { item, seen, step, buildWait };
}

test('it answers each wait of the step in the step order', () => {
  const ctx = setupTest();

  const answers = collectWaitAnswers({
    step: ctx.step,
    item: ctx.item,
    attempts: [],
    pullRequests: [],
    shipped: [],
    rules: {
      waits: new Map([
        ['one', ctx.buildWait('one', 'holds')],
        ['two', ctx.buildWait('two', 'waiting')],
      ]),
      repos: new Map(),
    },
  });

  expect(answers).toStrictEqual([
    { kind: 'one', answer: 'holds' },
    { kind: 'two', answer: 'waiting' },
  ]);
});

test('it reads a repo with no entry as one that ships none', () => {
  const ctx = setupTest();

  collectWaitAnswers({
    step: ctx.step,
    item: ctx.item,
    attempts: [],
    pullRequests: [],
    shipped: [],
    rules: {
      waits: new Map([
        ['one', ctx.buildWait('one', 'holds')],
        ['two', ctx.buildWait('two', 'holds')],
      ]),
      repos: new Map(),
    },
  });

  expect(ctx.seen).toStrictEqual(['one no commit "none"', 'two no commit "none"']);
});

test('it answers no wait for a step with none', () => {
  const ctx = setupTest();

  const answers = collectWaitAnswers({
    step: undefined,
    item: ctx.item,
    attempts: [],
    pullRequests: [],
    shipped: [],
    rules: { waits: new Map(), repos: new Map() },
  });

  expect(answers).toStrictEqual([]);
});

test('it picks the reason of the first wait that says skip', () => {
  const reason = pickWaitSkip([
    { kind: 'one', answer: 'holds' },
    { kind: 'two', answer: 'skip' },
    { kind: 'three', answer: 'skip' },
  ]);

  expect(reason).toBe('wait-skip:two');
});

test('it picks no skip reason when no wait says skip', () => {
  const reason = pickWaitSkip([
    { kind: 'one', answer: 'holds' },
    { kind: 'two', answer: 'waiting' },
  ]);

  expect(reason).toBeNull();
});
