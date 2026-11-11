import { expect, test } from 'bun:test';
import { contentHash, hashBytes } from '@boxxy/content-hash';
import type { Concept, ConceptPin } from '@boxxy/model';
import { defineGate, defineSignal, signalKey } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { loadRules } from './load-rules.ts';

test('it loads the example rules file', () => {
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
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['defer', { ref: 'defer@1', sourceHash: contentHash('defer source') }],
    ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
  ]);

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
    concepts,
    pins,
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
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['defer', { ref: 'defer@1', sourceHash: contentHash('defer source') }],
    ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
    ['rank', { ref: 'rank@1', sourceHash: contentHash('rank source') }],
  ]);

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
    concepts,
    pins,
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
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
    {
      name: 'rank',
      version: 1,
      signals: [
        defineSignal({ name: 'rank', params: z.object({ boost: z.number() }), value: () => null }),
      ],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['rank', { ref: 'rank@1', sourceHash: contentHash('rank source') }],
  ]);

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
    concepts,
    pins,
  });

  invariant(result.kind === 'loaded');

  expect(
    result.rules.signals
      .get(signalKey('rank', { boost: 3 }))
      ?.open((signal, params): unknown => ({ name: signal.name, params })),
  ).toStrictEqual({ name: 'rank', params: { boost: 3 } });
});

test('it rejects a rules file that is not valid YAML', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
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
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
  ]);

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
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: expect.arrayContaining([
      { file: 'rules.yaml', path: '', reason: { kind: 'invalid', message: expect.any(String) } },
    ]),
  });
});

test('it rejects a rules file whose aliases expand past the alias limit', () => {
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
    concepts: [],
    pins: new Map(),
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      { file: 'rules.yaml', path: '', reason: { kind: 'invalid', message: expect.any(String) } },
    ],
  });
});

test('it rejects a rules file saved in Latin-1 as invalid', () => {
  const latin1 = new Uint8Array([
    ...new TextEncoder().encode('version: 1\nlead: [caf'),
    0xe9,
    ...new TextEncoder().encode(']\n'),
  ]);

  const result: unknown = loadRules({
    checkout: { commit: '3f2a1c0', files: new Map([['rules.yaml', latin1]]) },
    concepts: [],
    pins: new Map(),
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: '',
        reason: { kind: 'invalid', message: 'the file is not valid UTF-8' },
      },
    ],
  });
});

test('it rejects a checkout with no rules file', () => {
  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')]]),
    },
    concepts: [],
    pins: new Map(),
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
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
    {
      name: 'rank',
      version: 1,
      signals: [
        defineSignal({ name: 'rank', params: z.object({ boost: z.number() }), value: () => null }),
      ],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['rank', { ref: 'rank@1', sourceHash: contentHash('rank source') }],
  ]);

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
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      { file: 'rules.yaml', path, reason: { kind: 'invalid', message: expect.any(String) } },
    ],
  });
});

test.each(['build', 'constructor'])(
  'it rejects the pipeline phase %s with no maxAttempts as invalid',
  (phase) => {
    const concepts: Concept[] = [
      {
        name: 'pool',
        version: 1,
        signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
      },
    ];

    const pins = new Map<string, ConceptPin>([
      ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ]);

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
  core.issue: { pipeline: [${phase}], maxAttempts: {}, recipes: { ${phase}: build-v1 } }
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
      concepts,
      pins,
    });

    expect(result).toStrictEqual({
      kind: 'rejected',
      rejections: [
        {
          file: 'rules.yaml',
          path: `kinds["core.issue"].maxAttempts.${phase}`,
          reason: { kind: 'invalid', message: `the pipeline phase ${phase} has no maxAttempts` },
        },
      ],
    });
  },
);

test('it rejects the reserved key __proto__ as invalid', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
  __proto__: { pipeline: [build], maxAttempts: { build: 2 }, recipes: { build: build-v1 } }
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
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'kinds.__proto__',
        reason: { kind: 'invalid', message: 'the key __proto__ is reserved' },
      },
    ],
  });
});

test('it rejects two pinned concepts that register one plug-in name as invalid', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
    {
      name: 'age',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['age', { ref: 'age@1', sourceHash: contentHash('age source') }],
  ]);

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, age@1]
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
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'concepts[1]',
        reason: { kind: 'invalid', message: 'the concepts pool and age both register oldest' },
      },
    ],
  });
});

test('it rejects a prompt path with a "." folder as invalid', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
  build-v1: { agent: claude, model: example-model, effort: high, prompt: ./prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'recipes.build-v1.prompt',
        reason: { kind: 'invalid', message: expect.any(String) },
      },
    ],
  });
});

test('it puts a signal that lead and a pool order both name once in the pool order', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
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
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
  ]);

  const result = loadRules({
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
  - { name: docs-build, slots: 1, takes: { phase: build }, order: [oldest, expedite] }
lead: [expedite]
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    pins,
  });

  invariant(result.kind === 'loaded');

  expect(result.rules.pools[0]?.order).toStrictEqual([
    signalKey('expedite', {}),
    signalKey('oldest', {}),
  ]);
});

test('it rejects a concept pinned twice as invalid', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
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

test.each([
  ['an unknown concept name', 'triage@1'],
  ['a known concept name at a version no concept has', 'expedite@2'],
])('it rejects %s', (_, ref) => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
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
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
  ]);

  const result: unknown = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, ${ref}]
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
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'concepts[1]',
        reason: { kind: 'unknown-concept', ref },
      },
    ],
  });
});

test('it rejects a pool order that names a signal no pinned concept registers', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
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
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
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
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
    {
      name: 'rank',
      version: 1,
      signals: [
        defineSignal({ name: 'rank', params: z.object({ boost: z.number() }), value: () => null }),
      ],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['rank', { ref: 'rank@1', sourceHash: contentHash('rank source') }],
  ]);

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
    concepts,
    pins,
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
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
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

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['hold', { ref: 'hold@1', sourceHash: contentHash('hold source') }],
  ]);

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
    concepts,
    pins,
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

test('it rejects a propagation line over an unknown relation type', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
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
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
  ]);

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
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'propagation[0].over',
        reason: { kind: 'unknown-relation-type', relation: 'parent' },
      },
    ],
  });
});

test('it rejects a propagation line for a signal with no combine', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
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
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
    ['expedite', { ref: 'expedite@1', sourceHash: contentHash('expedite source') }],
  ]);

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
    concepts,
    pins,
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
  ['a recipe name every object inherits', '{ build: toString }'],
])('it rejects a kind with %s for a pipeline phase', (_, recipes) => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
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
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
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
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
  });

  const after = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}!\n')],
      ]),
    },
    concepts,
    pins,
  });

  invariant(before.kind === 'loaded');
  invariant(after.kind === 'loaded');

  expect(after.rules.version).not.toBe(before.rules.version);
});

test("it changes the rules version when a concept's pinned hash changes", () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
  });

  const after = loadRules({
    checkout: { commit: '3f2a1c0', files },
    concepts,
    pins: new Map([
      ...pins,
      ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source, edited') }],
    ]),
  });

  invariant(before.kind === 'loaded');
  invariant(after.kind === 'loaded');

  expect(after.rules.version).not.toBe(before.rules.version);
});

test('it keeps the rules version when a file the loader does not read changes', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
    concepts,
    pins,
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
    concepts,
    pins,
  });

  invariant(before.kind === 'loaded');
  invariant(after.kind === 'loaded');

  expect(after.rules.version).toBe(before.rules.version);
});

test('it returns every rejection a rules file has in one result', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

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
      ]),
    },
    concepts,
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'concepts[1]',
        reason: { kind: 'unknown-concept', ref: 'triage@1' },
      },
      {
        file: 'rules.yaml',
        path: 'recipes.build-v1.prompt',
        reason: { kind: 'missing-prompt', path: 'prompts/build-v1.md' },
      },
    ],
  });
});
