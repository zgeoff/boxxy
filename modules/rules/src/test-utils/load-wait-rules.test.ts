import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { loadWaitRules } from './load-wait-rules.ts';

test('it loads a step with a wait, and the repos section with each ship rule', () => {
  const result = loadWaitRules({
    head: `repos:
  example/app: { ships: { deploy-tag: { tag: deployed/prod } } }
  example/lib: { ships: { release: {} } }
  example/lib-two: { ships: { release: { prerelease: true } } }
  example/service: { ships: { release: {}, then: { repo: example/deploy, tag: deployed/prod/service } } }
  example/notes: { ships: none }
  example/bare: {}`,
  });

  invariant(result.kind === 'loaded', 'the rules load');

  const kind = brandSchemas.itemKindName.parse('core.issue');
  const waits: unknown = result.rules.kinds.get(kind)?.pipeline.steps.at(1)?.waits;
  const repos: unknown = Object.fromEntries(result.rules.repos);

  expect(waits).toStrictEqual(['shipped']);

  expect(repos).toStrictEqual({
    'example/app': { ships: { 'deploy-tag': { tag: 'deployed/prod' } }, recipes: {} },
    'example/lib': { ships: { release: {} }, recipes: {} },
    'example/lib-two': { ships: { release: { prerelease: true } }, recipes: {} },
    'example/service': {
      // oxlint-disable-next-line unicorn/no-thenable -- `then` is the rules file's key for the deploy step of a release
      ships: { release: {}, then: { repo: 'example/deploy', tag: 'deployed/prod/service' } },
      recipes: {},
    },
    'example/notes': { ships: 'none', recipes: {} },
    'example/bare': { ships: 'none', recipes: {} },
  });
});

test('it rejects a repos entry with an unknown ship rule', () => {
  const result = loadWaitRules({ head: 'repos:\n  example/app: { ships: { branch: main } }' });

  expect(result.kind).toBe('rejected');
});

test('it reads a repo with no entry as one that ships none', () => {
  const result = loadWaitRules({ head: 'repos:\n  example/app: { ships: { release: {} } }' });

  invariant(result.kind === 'loaded', 'the rules load');

  expect(result.rules.repos.get(brandSchemas.repoName.parse('example/notes'))).toBeUndefined();
});
