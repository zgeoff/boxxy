import { expect, test } from 'bun:test';
import { contentHash, hashBytes } from '@boxxy/content-hash';
import type { Concept } from '@boxxy/model';
import { defineGate, defineSignal, signalKey } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { loadRules } from './load-rules.ts';

function setupTest() {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
      filterFields: [
        { name: 'phase', value: () => null },
        { name: 'kind', value: () => null },
        { name: 'repo', value: () => null },
      ],
    },
    {
      name: 'defer',
      version: 1,
      gates: [
        defineGate({ name: 'defer', liftable: true, params: z.object({}), hold: () => null }),
      ],
      waivers: [{ name: 'expedite-lifts-defer', lifts: 'defer', lift: () => null }],
      levers: ['plan.defer', 'plan.undefer'],
    },
    {
      name: 'expedite',
      version: 1,
      signals: [
        defineSignal({
          name: 'expedite',
          params: z.object({}),
          value: () => null,
          combine: (left, right) => Math.min(left, right),
        }),
      ],
      levers: ['plan.expedite', 'plan.unexpedite'],
    },
    {
      name: 'rank',
      version: 1,
      signals: [
        defineSignal({ name: 'rank', params: z.object({ boost: z.number() }), value: () => null }),
      ],
    },
    {
      name: 'hold',
      version: 1,
      gates: [
        defineGate({
          name: 'hold',
          liftable: false,
          params: z.object({ days: z.number() }),
          hold: () => null,
        }),
      ],
    },
  ];

  const pins = new Map(
    concepts.map((concept) => [
      concept.name,
      {
        ref: `${concept.name}@${concept.version}` as const,
        sourceHash: contentHash(`${concept.name} source`),
      },
    ]),
  );

  return { concepts, pins };
}

test('it loads the example rules file', () => {
  const ctx = setupTest();

  const prompt = new TextEncoder().encode('Build {{title}} in {{repo}}.\n');

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`# rules.yaml
version: 1

concepts: # name@version; each concept's pin ships with its package
  - pool@1
  - defer@1
  - expedite@1

kinds:
  core.issue:
    pipeline: [build]
    maxAttempts: { build: 2 }
    recipes: { build: build-v1 }

pools:
  - name: pepys-build
    slots: 2
    takes: { phase: build, kind: [core.issue], repo: [zgeoff/pepys] }
    order: [oldest] # plug-in references: a bare name, or { name: { parameters } }

lead: [expedite] # signals every pool sorts by before its own order

propagation:
  - value: expedite
    over: blocks
    toward: source # an expedited blocked item pulls its blockers forward

recipes:
  build-v1:
    agent: claude
    model: example-model
    effort: high
    prompt: prompts/build-v1.md
    source: subscription # the capacity source name; slice 1 has no router
`),
        ],
        ['prompts/build-v1.md', prompt],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'loaded',
    rules: {
      version: expect.stringMatching(/^[0-9a-f]{64}$/u),
      commit: '3f2a1c0',
      registry: expect.any(Object),
      signals: expect.any(Map),
      gates: [{ kind: 'gate', name: 'defer', key: 'defer', open: expect.any(Function) }],
      kinds: new Map([
        [
          'core.issue',
          {
            pipeline: { name: 'core.issue', steps: [{ phase: 'build', maxAttempts: 2 }] },
            recipes: { build: 'build-v1' },
          },
        ],
      ]),
      maxAttemptsByKind: new Map([['core.issue', new Map([['build', 2]])]]),
      pools: [
        {
          name: 'pepys-build',
          slots: 2,
          takes: { phase: ['build'], kind: ['core.issue'], repo: ['zgeoff/pepys'] },
          order: [signalKey('expedite', {}), signalKey('oldest', {})],
        },
      ],
      propagation: [{ value: 'expedite', over: 'blocks', toward: 'source' }],
      recipes: new Map([
        [
          'build-v1',
          {
            name: 'build-v1',
            recipe: {
              agent: 'claude',
              model: 'example-model',
              effort: 'high',
              prompt: 'prompts/build-v1.md',
              source: 'subscription',
            },
            promptHash: hashBytes(prompt),
            rulesVersion: expect.stringMatching(/^[0-9a-f]{64}$/u),
          },
        ],
      ]),
    },
    warnings: [],
  });
});

test('it builds the registry from the pinned concepts only', () => {
  const ctx = setupTest();

  const result = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, defer@1, expedite@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: [expedite]
propagation:
  - { value: expedite, over: blocks, toward: source }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  invariant(result.kind === 'loaded');

  expect({
    signal: [...result.rules.registry.signal.keys()],
    gate: [...result.rules.registry.gate.keys()],
    admission: [...result.rules.registry.admission.keys()],
    waiver: [...result.rules.registry.waiver.keys()],
    filterField: [...result.rules.registry['filter-field'].keys()],
    lever: [...result.rules.registry.lever.keys()],
    view: [...result.rules.registry.view.keys()],
    pins: result.rules.registry.pins.map((pin) => pin.ref),
  }).toStrictEqual({
    signal: ['oldest', 'expedite'],
    gate: ['defer'],
    admission: [],
    waiver: ['expedite-lifts-defer'],
    filterField: ['phase', 'kind', 'repo'],
    lever: ['plan.defer', 'plan.undefer', 'plan.expedite', 'plan.unexpedite'],
    view: [],
    pins: ['pool@1', 'defer@1', 'expedite@1'],
  });
});

test('it hands a signal the parameters its plug-in reference gives', () => {
  const ctx = setupTest();

  const result = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, rank@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest, { rank: { boost: 3 } }] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  invariant(result.kind === 'loaded');

  expect(
    result.rules.signals
      .get(signalKey('rank', { boost: 3 }))
      ?.open((signal, params): unknown => ({ name: signal.name, params })),
  ).toStrictEqual({ name: 'rank', params: { boost: 3 } });
});

test('it rejects a rules file that is not valid YAML', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, expedite@1
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: expect.arrayContaining([
      { file: 'rules.yaml', path: '', reason: { kind: 'invalid', message: expect.any(String) } },
    ]),
  });
});

test('it rejects a rules file whose aliases expand past the alias limit', () => {
  const ctx = setupTest();
  const aliases = Array.from({ length: 200 }, () => '*lead').join(', ');

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`version: 1\nlead: &lead [expedite]\npools: [${aliases}]\n`),
        ],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      { file: 'rules.yaml', path: '', reason: { kind: 'invalid', message: expect.any(String) } },
    ],
  });
});

test('it rejects a checkout with no rules file', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')]]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: '',
        reason: { kind: 'invalid', message: 'the checkout has no rules.yaml' },
      },
    ],
  });
});

test.each([
  [
    'a pool with a slot count that is not a number',
    '  - { name: docs-build, slots: two, takes: { phase: build }, order: [oldest] }',
    'pools[0].slots',
  ],
  [
    'a pool with a field the schema does not know',
    '  - { name: docs-build, slots: 1, size: 2, takes: { phase: build }, order: [oldest] }',
    'pools[0]',
  ],
  [
    'a plug-in reference whose map has two keys',
    '  - { name: docs-build, slots: 1, takes: { phase: build }, order: [{ oldest: {}, rank: { boost: 1 } }] }',
    'pools[0].order[0]',
  ],
  [
    'a second pool with the same name',
    '  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }\n  - { name: docs-build, slots: 1, takes: { phase: review }, order: [oldest] }',
    'pools[1].name',
  ],
])('it rejects %s as invalid', (_, poolLines, path) => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, rank@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
${poolLines}
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      { file: 'rules.yaml', path, reason: { kind: 'invalid', message: expect.any(String) } },
    ],
  });
});

test('it rejects a pipeline phase with no maxAttempts as invalid', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: {}, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'kinds["core.issue"].maxAttempts.build',
        reason: { kind: 'invalid', message: 'the pipeline phase build has no maxAttempts' },
      },
    ],
  });
});

test('it rejects a concept pinned twice as invalid', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, pool@2]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'concepts[1]',
        reason: { kind: 'invalid', message: 'the concept pool is pinned twice' },
      },
    ],
  });
});

test('it rejects an unknown concept name', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, triage@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'concepts[1]',
        reason: { kind: 'unknown-concept', ref: 'triage@1' },
      },
    ],
  });
});

test('it rejects a pool order that names a signal no pinned concept registers', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest, newest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pools[0].order[1]',
        reason: { kind: 'unknown-signal', signal: 'newest' },
      },
    ],
  });
});

test('it rejects a lead that names a signal no pinned concept registers', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: [expedite]
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'lead[0]',
        reason: { kind: 'unknown-signal', signal: 'expedite' },
      },
    ],
  });
});

test("it rejects a pool order reference whose parameters the signal's params schema refuses", () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, rank@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest, { rank: { boost: high } }] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pools[0].order[1]',
        reason: {
          kind: 'bad-plugin-params',
          pluginKind: 'signal',
          name: 'rank',
          message: expect.stringContaining('boost'),
        },
      },
    ],
  });
});

test('it rejects a pinned concept whose gate refuses empty parameters', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, hold@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'concepts[1]',
        reason: {
          kind: 'bad-plugin-params',
          pluginKind: 'gate',
          name: 'hold',
          message: expect.stringContaining('days'),
        },
      },
    ],
  });
});

test('it rejects a propagation line over an unknown link type', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, expedite@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: [expedite]
propagation:
  - { value: expedite, over: parent, toward: source }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'propagation[0].over',
        reason: { kind: 'unknown-link-type', link: 'parent' },
      },
    ],
  });
});

test('it rejects a propagation line for a signal with no combine', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, expedite@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: [expedite]
propagation:
  - { value: oldest, over: blocks, toward: source }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'propagation[0].value',
        reason: { kind: 'signal-without-combine', signal: 'oldest' },
      },
    ],
  });
});

test.each([
  ['no recipe entry', '{}'],
  ['a recipe name the rules file does not define', '{ build: build-v2 }'],
])('it rejects a kind with %s for a pipeline phase', (_, recipes) => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: ${recipes} }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'kinds["core.issue"].recipes.build',
        reason: { kind: 'missing-recipe', itemKind: 'core.issue', phase: 'build' },
      },
    ],
  });
});

test('it rejects a recipe whose prompt file is missing', () => {
  const ctx = setupTest();

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v2.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'recipes.build-v1.prompt',
        reason: { kind: 'missing-prompt', path: 'prompts/build-v1.md' },
      },
    ],
  });
});

test('it changes the rules version when one byte of the prompt template changes', () => {
  const ctx = setupTest();

  const rules = new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`);

  const before = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  const after = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}!\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  invariant(before.kind === 'loaded');
  invariant(after.kind === 'loaded');

  expect(after.rules.version).not.toBe(before.rules.version);
});

test("it changes the rules version when a concept's pinned hash changes", () => {
  const ctx = setupTest();

  const files = new Map([
    [
      'rules.yaml',
      new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
    ],
    ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
  ]);

  const before = loadRules({
    checkout: { commit: '3f2a1c0', files },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  const after = loadRules({
    checkout: { commit: '3f2a1c0', files },
    concepts: ctx.concepts,
    pins: new Map([
      ...ctx.pins,
      ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source, edited') }],
    ]),
  });

  invariant(before.kind === 'loaded');
  invariant(after.kind === 'loaded');

  expect(after.rules.version).not.toBe(before.rules.version);
});

test('it keeps the rules version when a file the loader does not read changes', () => {
  const ctx = setupTest();

  const rules = new TextEncoder().encode(`
version: 1
concepts: [pool@1]
kinds:
  core.issue: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`);

  const prompt = new TextEncoder().encode('Build {{title}}.\n');

  const before = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', prompt],
        ['README.md', new TextEncoder().encode('The rules.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  const after = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', prompt],
        ['README.md', new TextEncoder().encode('The rules for the build pool.\n')],
      ]),
    },
    concepts: ctx.concepts,
    pins: ctx.pins,
  });

  invariant(before.kind === 'loaded');
  invariant(after.kind === 'loaded');

  expect(after.rules.version).toBe(before.rules.version);
});
