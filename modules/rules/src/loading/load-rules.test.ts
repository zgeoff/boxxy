import { expect, test } from 'bun:test';
import { contentHash, hashBytes } from '@boxxy/content-hash';
import type { Concept, ConceptPin } from '@boxxy/model';
import { brandSchemas, defineGate, defineSignal, signalKey } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildExampleLoadInput } from '../test-utils/build-example-load-input.ts';
import { loadRules } from './load-rules.ts';

test('it loads the example rules file', () => {
  const input = buildExampleLoadInput();

  const phases = [
    buildMockPhaseKind({
      name: 'triage',
      outcomes: ['accepted', 'duplicate', 'declined', 'needs-owner', 'split'],
    }),
    buildMockPhaseKind({ name: 'design', outcomes: ['designed', 'blocked', 'abandoned'] }),
    buildMockPhaseKind({ name: 'build', outcomes: ['built', 'blocked', 'abandoned'] }),
    buildMockPhaseKind({ name: 'review', outcomes: ['passed', 'changes-requested', 'failed'] }),
  ];

  const prompts = [...input.checkout.files]
    .filter(([path]) => path.startsWith('prompts/'))
    .map(([path, bytes]): [string, Uint8Array] => [
      path.slice('prompts/'.length, -'.md'.length),
      bytes,
    ]);

  const result: unknown = loadRules({ ...input, phases });

  const standard = {
    name: 'standard',
    steps: [
      {
        phase: 'triage',
        maxAttempts: 2,
        timeoutMinutes: 20,
        on: {
          accepted: 'next',
          duplicate: { hold: 'duplicate' },
          declined: { hold: 'declined' },
          'needs-owner': { hold: 'needs-owner' },
          split: { end: 'split' },
        },
      },
      {
        phase: 'design',
        maxAttempts: 2,
        timeoutMinutes: 90,
        on: { designed: 'next', blocked: { hold: 'blocked' }, abandoned: 'again' },
      },
      {
        phase: 'build',
        maxAttempts: 2,
        timeoutMinutes: 180,
        on: { built: 'next', blocked: { hold: 'blocked' }, abandoned: 'again' },
      },
      {
        phase: 'review',
        maxAttempts: 2,
        timeoutMinutes: 45,
        on: {
          passed: { end: 'reviewed' },
          'changes-requested': { to: 'build', max: 3, resume: true },
          failed: 'again',
        },
      },
    ],
  };

  const recipes = {
    triage: 'triage-v1',
    design: 'design-v1',
    'design/attended': 'design-attended-v1',
    build: 'build-v1',
    review: 'review-run',
  };

  const opus = { agent: 'claude', model: 'claude-opus-5-5', effort: 'medium' };

  const settingsByRecipe = new Map([
    ['triage-v1', { ...opus, skills: [] }],
    ['design-v1', { ...opus, skills: ['bake-off'] }],
    ['design-attended-v1', { ...opus, skills: ['bake-off'] }],
    ['build-v1', { ...opus, skills: [] }],
    [
      'review-run',
      { agent: 'claude-review', model: 'claude-haiku-5-5', effort: 'low', skills: [] },
    ],
  ]);

  expect(result).toStrictEqual({
    kind: 'loaded',
    rules: {
      version: expect.stringMatching(/^[0-9a-f]{64}$/u),
      commit: '3f2a1c0',
      registry: expect.any(Object),
      signals: new Map([[signalKey('oldest', {}), expect.any(Object)]]),
      gates: [{ kind: 'gate', name: 'defer', key: 'defer', open: expect.any(Function) }],
      kinds: new Map([
        ['core.idea', { pipeline: standard, recipes }],
        ['core.issue', { pipeline: standard, recipes }],
      ]),
      phases: new Map(phases.map((phase) => [phase.name, phase])),
      limits: [
        { name: 'workers', max: 7, counts: {} },
        { name: 'owner-design', max: 1, counts: { phase: ['design'], designMode: ['attended'] } },
      ],
      pools: [
        { name: 'triage', takes: { phase: ['triage'] }, order: [signalKey('oldest', {})] },
        {
          name: 'design-with-owner',
          takes: { phase: ['design'], designMode: ['attended'] },
          order: [signalKey('oldest', {})],
        },
        {
          name: 'design',
          takes: { phase: ['design'], designMode: ['agent'] },
          order: [signalKey('oldest', {})],
        },
        { name: 'review', takes: { phase: ['review'] }, order: [signalKey('oldest', {})] },
        { name: 'build', takes: { phase: ['build'] }, order: [signalKey('oldest', {})] },
      ],
      propagation: [],
      recipes: new Map(
        prompts.map(([name, bytes]) => [
          name,
          {
            name,
            recipe: {
              agent: settingsByRecipe.get(name)?.agent,
              model: settingsByRecipe.get(name)?.model,
              effort: settingsByRecipe.get(name)?.effort,
              prompt: `prompts/${name}.md`,
              source: 'subscription',
              skills: settingsByRecipe.get(name)?.skills,
            },
            promptHash: hashBytes(bytes),
            rulesVersion: expect.stringMatching(/^[0-9a-f]{64}$/u),
          },
        ]),
      ),
      sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 },
      skills: { source: 'example/skills', ref: '4f1c9e07a2b35d68c0e1f7a9b3d5c2e8f6a4b1d0' },
      relationTypes: new Map([
        ['blocks', { name: 'blocks' }],
        ['duplicate-of', { name: 'duplicate-of' }],
        ['relates-to', { name: 'relates-to' }],
      ]),
      merge: null,
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, defer@1, expedite@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: [expedite]
propagation:
  - { value: expedite, over: blocks, toward: source }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, rank@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest, { rank: { boost: 3 } }] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
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
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
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
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins: new Map(),
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      { file: 'rules.yaml', path: '', reason: { kind: 'invalid', message: expect.any(String) } },
    ],
  });
});

test('it rejects a rules file whose alias holds itself as invalid at the alias', () => {
  const result: unknown = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([['rules.yaml', new TextEncoder().encode('lead: &cycle [*cycle]\n')]]),
    },
    concepts: [],
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins: new Map(),
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'lead[0]',
        reason: { kind: 'invalid', message: 'the value holds itself through an alias' },
      },
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: { commit: '3f2a1c0', files: new Map([['rules.yaml', latin1]]) },
    concepts: [],
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')]]),
    },
    concepts: [],
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    'a pool with a slot count',
    '  - { name: docs-build, slots: 2, takes: {}, order: [oldest] }',
    'pools[0].slots',
  ],
  [
    'a pool with a field the schema does not know',
    '  - { name: docs-build, size: 2, takes: {}, order: [oldest] }',
    'pools[0]',
  ],
  [
    'a plug-in reference whose map has two keys',
    '  - { name: docs-build, takes: {}, order: [{ oldest: {}, rank: { boost: 1 } }] }',
    'pools[0].order[0]',
  ],
  [
    'a second pool with the same name',
    '  - { name: docs-build, takes: {}, order: [oldest] }\n  - { name: docs-build, takes: {}, order: [oldest] }',
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, rank@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
${poolLines}
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
  'it rejects the pipeline step %s with no timeoutMinutes',
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
      workers: [brandSchemas.workerKindName.parse('atc.session')],
      checkout: {
        commit: '3f2a1c0',
        files: new Map([
          [
            'rules.yaml',
            new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: ${phase}, maxAttempts: 2, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { ${phase}: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
          ],
          ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
        ]),
      },
      concepts,
      phases: [buildMockPhaseKind({ name: phase, outcomes: ['built'] })],
      pins,
    });

    expect(result).toStrictEqual({
      kind: 'rejected',
      rejections: [
        {
          file: 'rules.yaml',
          path: 'pipelines.standard[0]',
          reason: { kind: 'step-without-timeout', phase },
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  __proto__: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, age@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: ./prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, expedite@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest, expedite] }
lead: [expedite]
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, pool@2]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, ${ref}]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest, newest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: [expedite]
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, rank@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest, { rank: { boost: high } }] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, hold@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, expedite@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: [expedite]
propagation:
  - { value: expedite, over: parent, toward: source }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, expedite@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: [expedite]
propagation:
  - { value: oldest, over: blocks, toward: source }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
  {
    title: 'no recipe entry',
    recipes: '{}',
    kind: 'step-without-recipe',
    phase: 'build',
    path: 'kinds["core.issue"].recipes.build',
  },
  {
    title: 'a recipe name the rules file does not define',
    recipes: '{ build: build-v2 }',
    kind: 'missing-recipe',
    phase: 'build',
    path: 'kinds["core.issue"].recipes.build',
  },
  {
    title: 'a recipe name every object inherits',
    recipes: '{ build: toString }',
    kind: 'missing-recipe',
    phase: 'build',
    path: 'kinds["core.issue"].recipes.build',
  },
  {
    title: 'an attended recipe name the rules file does not define',
    recipes: '{ build: build-v1, build/attended: build-v2 }',
    kind: 'missing-recipe',
    phase: 'build/attended',
    path: 'kinds["core.issue"].recipes["build/attended"]',
  },
])('it rejects a kind with $title for a pipeline phase', (row) => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: ${row.recipes} }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: row.path,
        reason: { kind: row.kind, itemKind: 'core.issue', phase: row.phase },
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v2.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`);

  const before = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  const after = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}!\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
    ],
    ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
  ]);

  const before = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: { commit: '3f2a1c0', files },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  const after = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: { commit: '3f2a1c0', files },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`);

  const prompt = new TextEncoder().encode('Build {{title}}.\n');

  const before = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', prompt],
        ['README.md', new TextEncoder().encode('The rules.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  const after = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rules],
        ['prompts/build-v1.md', prompt],
        ['README.md', new TextEncoder().encode('The rules for the build pool.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1, triage@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: docs-build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
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

test.each([
  [
    'a step whose phase no phase kind has',
    `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next, blocked: { hold: blocked } } }
    - { phase: deploy, maxAttempts: 2, timeoutMinutes: 30, on: { done: next } }`,
    'pipelines.standard[1].phase',
    { kind: 'unknown-phase', phase: 'deploy' },
  ],
  [
    'a step that maps no edge for an outcome of its phase kind',
    '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }',
    'pipelines.standard[0].on',
    { kind: 'unmapped-outcome', phase: 'build', outcome: 'blocked' },
  ],
  [
    'a step that maps an outcome its phase kind lacks',
    '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next, blocked: { hold: blocked }, failed: again } }',
    'pipelines.standard[0].on.failed',
    { kind: 'unknown-outcome', phase: 'build', outcome: 'failed' },
  ],
  [
    'a backward edge with no max',
    `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next, blocked: { hold: blocked } } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: { end: reviewed }, changes-requested: { to: build } } }`,
    'pipelines.standard[1].on.changes-requested',
    { kind: 'open-loop', phase: 'review', outcome: 'changes-requested' },
  ],
  [
    'an edge back to its own step with no max',
    '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next, blocked: { to: build } } }',
    'pipelines.standard[0].on.blocked',
    { kind: 'open-loop', phase: 'build', outcome: 'blocked' },
  ],
  [
    'an edge to a phase the pipeline lacks',
    `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next, blocked: { hold: blocked } } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: { end: reviewed }, changes-requested: { to: design, max: 3 } } }`,
    'pipelines.standard[1].on.changes-requested',
    { kind: 'edge-to-unknown-phase', phase: 'review', to: 'design' },
  ],
  [
    'resume on a forward edge',
    `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: { to: review, resume: true }, blocked: { hold: blocked } } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: { end: reviewed }, changes-requested: { to: build, max: 3 } } }`,
    'pipelines.standard[0].on.built',
    { kind: 'resume-on-forward-edge', phase: 'build', outcome: 'built' },
  ],
  [
    'a hold edge that names an engine hold reason',
    '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next, blocked: { hold: attempts used up } } }',
    'pipelines.standard[0].on.blocked.hold',
    { kind: 'engine-hold-reason', phase: 'build', outcome: 'blocked', reason: 'attempts used up' },
  ],
])('it rejects %s', (_, steps, path, reason) => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
${steps}
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1, review: build-v1, deploy: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [
      buildMockPhaseKind({ name: 'build', outcomes: ['built', 'blocked'] }),
      buildMockPhaseKind({ name: 'review', outcomes: ['passed', 'changes-requested'] }),
    ],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [{ file: 'rules.yaml', path, reason }],
  });
});

test('it rejects a step whose phase kind lists an engine outcome', () => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next, lost: again } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built', 'lost'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pipelines.standard[0].phase',
        reason: { kind: 'engine-outcome-listed', phase: 'build', outcome: 'lost' },
      },
    ],
  });
});

test.each([
  {
    title: 'a step whose phase kind names a worker the server did not build',
    steps: `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: merge, maxAttempts: 2, timeoutMinutes: 240, on: { merged: { end: merged } } }`,
    recipes: '{ build: build-v1, merge: build-v1 }',
    merge: "merge: { method: squash, checks: ['pr / checks'] }",
    workers: ['atc.session'],
    path: 'pipelines.standard[1].phase',
    reason: { kind: 'unknown-worker', phase: 'merge', worker: 'merge.forge' },
  },
  {
    title: 'a merge step in a file with no merge block',
    steps: `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: merge, maxAttempts: 2, timeoutMinutes: 240, on: { merged: { end: merged } } }`,
    recipes: '{ build: build-v1, merge: build-v1 }',
    merge: '',
    workers: ['atc.session', 'merge.forge'],
    path: 'pipelines.standard[1].phase',
    reason: { kind: 'merge-without-rules' },
  },
  {
    title: 'a merge block with no checks',
    steps: `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: merge, maxAttempts: 2, timeoutMinutes: 240, on: { merged: { end: merged } } }`,
    recipes: '{ build: build-v1, merge: build-v1 }',
    merge: 'merge: { method: squash, checks: [] }',
    workers: ['atc.session', 'merge.forge'],
    path: 'merge.checks',
    reason: { kind: 'empty-merge-checks' },
  },
  {
    title: 'a session: builder recipe on a step with no build step before it',
    steps: `    - { phase: verify, maxAttempts: 2, timeoutMinutes: 90, on: { verified: next } }
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: { end: built } } }`,
    recipes: '{ build: build-v1, verify: verify-builder }',
    merge: '',
    workers: ['atc.session'],
    path: 'kinds["core.issue"].recipes.verify',
    reason: { kind: 'builder-session-not-kept', recipe: 'verify-builder' },
  },
])('it rejects $title', (row) => {
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
    workers: row.workers.map((name) => brandSchemas.workerKindName.parse(name)),
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
${row.steps}
kinds:
  core.issue: { pipeline: standard, recipes: ${row.recipes} }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
  verify-builder: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [], session: builder }
${row.merge}
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [
      buildMockPhaseKind({ name: 'build', outcomes: ['built'] }),
      buildMockPhaseKind({ name: 'verify', outcomes: ['verified'] }),
      buildMockPhaseKind({ name: 'merge', outcomes: ['merged'], worker: 'merge.forge' }),
    ],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [{ file: 'rules.yaml', path: row.path, reason: row.reason }],
  });
});

test.each([
  {
    title: 'a build recipe that names a review agent',
    steps: `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: { end: reviewed } } }`,
    recipes: '{ build: review-run, review: review-run }',
    reviewAgents: ['claude-review'],
    path: 'kinds["core.issue"].recipes.build',
    reason: {
      kind: 'review-agent-outside-review',
      itemKind: 'core.issue',
      phase: 'build',
      recipe: 'review-run',
    },
  },
  {
    title: 'a review recipe that names no review agent',
    steps: `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: { end: reviewed } } }`,
    recipes: '{ build: build-v1, review: build-v1 }',
    reviewAgents: ['claude-review'],
    path: 'kinds["core.issue"].recipes.review',
    reason: { kind: 'review-without-review-agent', itemKind: 'core.issue', recipe: 'build-v1' },
  },
  {
    title: 'an edge with resume: true to the review step',
    steps: `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: next } }
    - { phase: verify, maxAttempts: 2, timeoutMinutes: 90, on: { verified: { end: verified }, failed: { to: review, max: 2, resume: true } } }`,
    recipes: '{ build: build-v1, review: review-run, verify: build-v1 }',
    reviewAgents: ['claude-review'],
    path: 'pipelines.standard[2].on.failed',
    reason: { kind: 'review-session-resumed', phase: 'verify', outcome: 'failed' },
  },
  {
    title: 'a review recipe with session: builder',
    steps: `    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: { end: reviewed } } }`,
    recipes: '{ build: build-v1, review: review-builder }',
    reviewAgents: ['claude-review'],
    path: 'kinds["core.issue"].recipes.review',
    reason: { kind: 'review-builder-session', itemKind: 'core.issue', recipe: 'review-builder' },
  },
])('it rejects $title when the server names review agents', (row) => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    reviewAgents: row.reviewAgents,
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
${row.steps}
kinds:
  core.issue: { pipeline: standard, recipes: ${row.recipes} }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
  review-run: { agent: claude-review, model: example-model, effort: low, prompt: prompts/build-v1.md, source: subscription, skills: [] }
  review-builder: { agent: claude-review, model: example-model, effort: low, prompt: prompts/build-v1.md, source: subscription, skills: [], session: builder }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [
      buildMockPhaseKind({ name: 'build', outcomes: ['built'] }),
      buildMockPhaseKind({ name: 'review', outcomes: ['passed'] }),
      buildMockPhaseKind({ name: 'verify', outcomes: ['verified', 'failed'] }),
    ],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [{ file: 'rules.yaml', path: row.path, reason: row.reason }],
  });
});

test.each([
  { title: 'names review agents', reviewAgents: ['claude-review'], build: 'build-v1' },
  { title: 'names no review agent', reviewAgents: [], build: 'review-run' },
])('it loads a review recipe on a review agent when the server $title', (row) => {
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

  const result = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    reviewAgents: row.reviewAgents,
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: review, maxAttempts: 2, timeoutMinutes: 45, on: { passed: { end: reviewed }, failed: { to: build, max: 3, resume: true } } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: ${row.build}, review: review-run } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
  review-run: { agent: claude-review, model: example-model, effort: low, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [
      buildMockPhaseKind({ name: 'build', outcomes: ['built'] }),
      buildMockPhaseKind({ name: 'review', outcomes: ['passed', 'failed'] }),
    ],
    pins,
  });

  expect(result.kind).toBe('loaded');
});

test('it loads a merge block, and a session: builder recipe on a step after a build step', () => {
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

  const result = loadRules({
    workers: [
      brandSchemas.workerKindName.parse('atc.session'),
      brandSchemas.workerKindName.parse('merge.forge'),
    ],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: verify, maxAttempts: 2, timeoutMinutes: 90, on: { verified: next, failed: { to: build, max: 2, resume: true } } }
    - { phase: merge, maxAttempts: 2, timeoutMinutes: 240, on: { merged: { end: merged }, unverified: { to: verify, max: 2 } } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1, verify: verify-builder, merge: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
  verify-builder: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [], session: builder }
merge:
  method: squash
  checks: ['pr / checks', 'verify / gate']
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [
      buildMockPhaseKind({ name: 'build', outcomes: ['built'] }),
      buildMockPhaseKind({ name: 'verify', outcomes: ['verified', 'failed'] }),
      buildMockPhaseKind({
        name: 'merge',
        outcomes: ['merged', 'unverified'],
        worker: 'merge.forge',
      }),
    ],
    pins,
  });

  invariant(result.kind === 'loaded', 'the rules load');

  expect({
    merge: result.rules.merge,
    session: result.rules.recipes.get(brandSchemas.recipeName.parse('verify-builder'))?.recipe
      .session,
  }).toStrictEqual({
    merge: { method: 'squash', checks: ['pr / checks', 'verify / gate'] },
    session: 'builder',
  });
});

test.each([
  [
    'afterQuietMinutes below afterIdleMinutes',
    '{ afterIdleMinutes: 30, afterQuietMinutes: 20, afterUnattendedMinutes: 240 }',
    'sleep.afterQuietMinutes',
    { kind: 'quiet-below-idle' },
  ],
  [
    'afterUnattendedMinutes below afterQuietMinutes',
    '{ afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 45 }',
    'sleep.afterUnattendedMinutes',
    { kind: 'unattended-below-quiet' },
  ],
])('it rejects sleep times with %s', (_, sleep, path, reason) => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: ${sleep}
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [{ file: 'rules.yaml', path, reason }],
  });
});

test('it rejects a recipe that lists a skill when the rules pin no skills commit', () => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [bake-off] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'recipes.build-v1.skills',
        reason: { kind: 'skills-without-pin', recipe: 'build-v1' },
      },
    ],
  });
});

test.each([
  [
    'a limit',
    '  - { name: workers, max: 7, counts: {} }\n  - { name: fast-lane, max: 1, counts: { lane: fast } }',
    '  - { name: build, takes: { phase: build }, order: [oldest] }',
    'limits[1].counts.lane',
  ],
  [
    'a pool',
    '  - { name: workers, max: 7, counts: {} }',
    '  - { name: build, takes: { lane: fast }, order: [oldest] }',
    'pools[0].takes.lane',
  ],
])('it rejects %s that filters on a field no concept registers', (_, limits, pools, path) => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
      filterFields: [{ name: 'phase', value: () => null }],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

  const result: unknown = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
${limits}
pools:
${pools}
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      { file: 'rules.yaml', path, reason: { kind: 'unknown-filter-field', field: 'lane' } },
    ],
  });
});

test.each([
  ['a phase no limit counts', '{ phase: review }'],
  ['two phases of which a limit counts one', '{ phase: [build, review] }'],
  ['no filter at all', '{}'],
])('it rejects a pool that takes %s', (_, takes) => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
      filterFields: [{ name: 'phase', value: () => null }],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

  const result: unknown = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: builds, max: 2, counts: { phase: build } }
pools:
  - { name: build, takes: { phase: build }, order: [oldest] }
  - { name: other, takes: ${takes}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'pools[1]',
        reason: { kind: 'pool-without-limit', pool: 'other' },
      },
    ],
  });
});

test('it loads a pool whose takes are narrower than the counts of a limit', () => {
  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
      filterFields: [
        { name: 'phase', value: () => null },
        { name: 'kind', value: () => null },
      ],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

  const result = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: builds, max: 2, counts: { phase: [build, review] } }
pools:
  - { name: build, takes: { phase: build, kind: core.issue }, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result.kind).toBe('loaded');
});

test.each([
  {
    title: 'a limit name used twice',
    limits: '  - { name: workers, max: 7, counts: {} }\n  - { name: workers, max: 3, counts: {} }',
    kinds: '  core.issue: { pipeline: standard, recipes: { build: build-v1 } }',
    steps: '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }',
    relationTypes: '[blocks]',
    path: 'limits[1].name',
  },
  {
    title: 'a kind that names a pipeline the file lacks',
    limits: '  - { name: workers, max: 7, counts: {} }',
    kinds: '  core.issue: { pipeline: fast, recipes: { build: build-v1 } }',
    steps: '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }',
    relationTypes: '[blocks]',
    path: 'kinds["core.issue"].pipeline',
  },
  {
    title: 'a kind with the slice 1 maxAttempts map',
    limits: '  - { name: workers, max: 7, counts: {} }',
    kinds:
      '  core.issue: { pipeline: standard, maxAttempts: { build: 2 }, recipes: { build: build-v1 } }',
    steps: '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }',
    relationTypes: '[blocks]',
    path: 'kinds["core.issue"]',
  },
  {
    title: 'a pipeline that names one phase twice',
    limits: '  - { name: workers, max: 7, counts: {} }',
    kinds: '  core.issue: { pipeline: standard, recipes: { build: build-v1 } }',
    steps:
      '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }\n    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }',
    relationTypes: '[blocks]',
    path: 'pipelines.standard[1].phase',
  },
  {
    title: 'a relation type listed twice',
    limits: '  - { name: workers, max: 7, counts: {} }',
    kinds: '  core.issue: { pipeline: standard, recipes: { build: build-v1 } }',
    steps: '    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }',
    relationTypes: '[blocks, blocks]',
    path: 'relationTypes[1]',
  },
])('it rejects $title as invalid', (row) => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
${row.steps}
kinds:
${row.kinds}
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: ${row.relationTypes}
limits:
${row.limits}
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: row.path,
        reason: { kind: 'invalid', message: expect.any(String) },
      },
    ],
  });
});

test.each(['main', '4f1c9e0'])(
  'it rejects the skills ref %s, which is no full commit, as invalid',
  (ref) => {
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
      workers: [brandSchemas.workerKindName.parse('atc.session')],
      checkout: {
        commit: '3f2a1c0',
        files: new Map([
          [
            'rules.yaml',
            new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
skills: { source: example/skills, ref: ${ref} }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
          ],
          ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
        ]),
      },
      concepts,
      phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
      pins,
    });

    expect(result).toStrictEqual({
      kind: 'rejected',
      rejections: [
        {
          file: 'rules.yaml',
          path: 'skills.ref',
          reason: { kind: 'invalid', message: expect.any(String) },
        },
      ],
    });
  },
);

test("it changes the rules version when a phase kind's version changes", () => {
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
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
    ],
    ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
  ]);

  const before = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: { commit: '3f2a1c0', files },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  const after = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: { commit: '3f2a1c0', files },
    concepts,
    phases: [{ ...buildMockPhaseKind({ name: 'build', outcomes: ['built'] }), version: 2 }],
    pins,
  });

  invariant(before.kind === 'loaded');
  invariant(after.kind === 'loaded');

  expect(after.rules.version).not.toBe(before.rules.version);
});

test.each([
  [
    'an unknown placeholder',
    'Build {{ title }}.\n\n{% if design %}{{ desgin }}{% endif %}\n',
    'the template names "desgin", which is not a placeholder; the placeholders are ticket, title, outcome, body, acceptance, design, findings, stopped, notes, security, repo, attempt_id, input',
  ],
  [
    'a syntax error',
    'Build {{ title }}.\n\n{% if design %}## Design\n',
    expect.stringMatching(/^the template does not parse: tag \{% if design %\} not closed/u),
  ],
  [
    'an include',
    "Build {{ title }}.\n\n{% include 'other.md' %}\n",
    expect.stringMatching(/^the template does not parse: tag "include" not found/u),
  ],
  [
    'an assign',
    'Build {{ title }}.\n\n{% if design %}{% assign heading = title %}{% endif %}{{ heading }}\n',
    expect.stringMatching(/^the template does not parse: tag "assign" not found/u),
  ],
  [
    'a date filter',
    "Build {{ title }} on {{ 'now' | date: '%Y-%m-%d' }}.\n",
    expect.stringMatching(/^the template does not parse: undefined filter: date/u),
  ],
])('it rejects a prompt template with %s', (_, template, message) => {
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
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        [
          'rules.yaml',
          new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1 } }
pools:
  - { name: build, takes: {}, order: [oldest] }
lead: []
propagation: []
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`),
        ],
        ['prompts/build-v1.md', new TextEncoder().encode(template)],
      ]),
    },
    concepts,
    phases: [buildMockPhaseKind({ name: 'build', outcomes: ['built'] })],
    pins,
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'recipes.build-v1.prompt',
        reason: { kind: 'bad-prompt', path: 'prompts/build-v1.md', message },
      },
    ],
  });
});
