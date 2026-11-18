import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { findRecipeName } from './find-recipe-name.ts';

interface Layers {
  readonly repo: Readonly<Record<string, string>>;
  readonly kind: Readonly<Record<string, string>>;
}

function setupTest(layers: Layers) {
  const kind = brandSchemas.itemKindName.parse('bug');
  const repo = brandSchemas.repoName.parse('example/app');

  const rules = {
    kinds: new Map([
      [
        kind,
        {
          pipeline: { name: brandSchemas.pipelineName.parse('build'), steps: [] },
          recipes: Object.fromEntries(
            Object.entries(layers.kind).map(([key, name]) => [
              key,
              brandSchemas.recipeName.parse(name),
            ]),
          ),
        },
      ],
    ]),
    repos: new Map([
      [
        repo,
        {
          ships: 'none' as const,
          recipes: Object.fromEntries(
            Object.entries(layers.repo).map(([key, name]) => [
              key,
              brandSchemas.recipeName.parse(name),
            ]),
          ),
        },
      ],
    ]),
  };

  return {
    findInRepo: (repoName: string, mode: 'agent' | 'attended') =>
      findRecipeName(
        rules,
        { kind, repo: brandSchemas.repoName.parse(repoName) },
        brandSchemas.phaseName.parse('live'),
        mode,
      ),
  };
}

test.each([
  {
    title: 'the repo attended recipe first',
    repo: { 'live/attended': 'repo-attended', live: 'repo-plain' },
    kind: { 'live/attended': 'kind-attended', live: 'kind-plain' },
    mode: 'attended',
    expected: 'repo-attended',
  },
  {
    title: 'the repo plain recipe in agent mode',
    repo: { 'live/attended': 'repo-attended', live: 'repo-plain' },
    kind: { 'live/attended': 'kind-attended', live: 'kind-plain' },
    mode: 'agent',
    expected: 'repo-plain',
  },
  {
    title: 'the repo plain recipe before the kind attended one',
    repo: { live: 'repo-plain' },
    kind: { 'live/attended': 'kind-attended', live: 'kind-plain' },
    mode: 'attended',
    expected: 'repo-plain',
  },
  {
    title: 'the kind attended recipe',
    repo: {},
    kind: { 'live/attended': 'kind-attended', live: 'kind-plain' },
    mode: 'attended',
    expected: 'kind-attended',
  },
  {
    title: 'the kind plain recipe in agent mode',
    repo: {},
    kind: { 'live/attended': 'kind-attended', live: 'kind-plain' },
    mode: 'agent',
    expected: 'kind-plain',
  },
  {
    title: 'the kind plain recipe when no attended one exists',
    repo: {},
    kind: { live: 'kind-plain' },
    mode: 'attended',
    expected: 'kind-plain',
  },
] as const)('it picks $title', (row) => {
  const ctx = setupTest(row);
  const picked: unknown = ctx.findInRepo('example/app', row.mode);

  expect(picked).toBe(row.expected);
});

test('it picks the kind recipe for a repo with no recipes of its own', () => {
  const ctx = setupTest({ repo: { live: 'repo-plain' }, kind: { live: 'kind-plain' } });
  const picked: unknown = ctx.findInRepo('example/lib', 'agent');

  expect(picked).toBe('kind-plain');
});

test('it returns undefined when no layer names the phase', () => {
  const ctx = setupTest({ repo: {}, kind: {} });

  expect(ctx.findInRepo('example/app', 'agent')).toBeUndefined();
});
