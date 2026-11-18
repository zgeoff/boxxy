import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockSpawnScope } from '@boxxy/model/test-utils/build-mock-spawn-scope';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import { loadServerRules } from './load-server-rules.ts';

test('it loads the example rules with the review phase on the atc worker from the checkout alone', () => {
  const loaded = loadServerRules(
    buildExampleLoadInput().checkout,
    buildMockSpawnScope({ agents: {}, phases: {} }),
  );

  const review =
    loaded.kind === 'loaded'
      ? loaded.rules.phases.get(brandSchemas.phaseName.parse('review'))
      : undefined;

  expect(review?.worker).toBe(brandSchemas.workerKindName.parse('atc.session'));
});

test('it loads the example rules with the review agent that only their review recipe names', () => {
  const loaded = loadServerRules(buildExampleLoadInput().checkout, buildMockSpawnScope());

  expect(loaded.kind).toBe('loaded');
});

test('it refuses the example rules when their build agent is scoped to review', () => {
  const loaded = loadServerRules(buildExampleLoadInput().checkout, {
    ...buildMockSpawnScope(),
    agents: { 'claude-review': { phases: ['review'] }, claude: { phases: ['review'] } },
  });

  expect(loaded).toStrictEqual({
    kind: 'rejected',
    rejections: expect.arrayContaining([
      {
        file: 'rules.yaml',
        path: 'kinds["core.issue"].recipes.build',
        reason: {
          kind: 'agent-outside-scope',
          itemKind: 'core.issue',
          phase: 'build',
          recipe: 'build-v1',
          agent: 'claude',
          repo: null,
        },
      },
    ]),
  });
});
