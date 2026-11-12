import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import { buildMockSnapshot } from '@boxxy/model/test-utils/build-mock-snapshot';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { loadRules } from '@boxxy/rules';
import buildPrompt from '@boxxy/rules/example/prompts/build-v1.md' with { type: 'text' };
import designAttendedPrompt from '@boxxy/rules/example/prompts/design-attended-v1.md' with { type: 'text' };
import designPrompt from '@boxxy/rules/example/prompts/design-v1.md' with { type: 'text' };
import reviewPrompt from '@boxxy/rules/example/prompts/review-run.md' with { type: 'text' };
import triagePrompt from '@boxxy/rules/example/prompts/triage-v1.md' with { type: 'text' };
import exampleRules from '@boxxy/rules/example/rules.yaml' with { type: 'text' };
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildFrame } from './build-frame.ts';
import { concepts } from './concepts.ts';
import { decide } from './decide.ts';
import { conceptPins } from './generated/concept-pins.ts';

test('it loads the example rules file against the built-in concepts and their pins', () => {
  const ctx = setupTest();

  expect(ctx.loadExample()).toStrictEqual({
    kind: 'loaded',
    rules: expect.objectContaining({
      pools: [
        expect.objectContaining({ name: 'triage' }),
        expect.objectContaining({ name: 'design-with-owner' }),
        expect.objectContaining({ name: 'design' }),
        expect.objectContaining({ name: 'review' }),
        expect.objectContaining({ name: 'build' }),
      ],
    }),
    warnings: [],
  });
});

test('it starts one attended design under the example rules and holds the next by owner-design', () => {
  const ctx = setupTest();
  const loaded = ctx.loadExample();

  invariant(loaded.kind === 'loaded', 'the example rules file loads');

  const design = {
    kind: 'phase',
    phase: brandSchemas.phaseName.parse('design'),
    round: 1,
  } as const;

  const first = buildMockV1ItemView({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000001'),
    filedAt: brandSchemas.instant.parse(1000),
    fields: { designMode: 'attended' },
    position: design,
  });

  const second = buildMockV1ItemView({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000002'),
    filedAt: brandSchemas.instant.parse(2000),
    fields: { designMode: 'attended' },
    position: design,
  });

  const unset = buildMockV1ItemView({
    id: brandSchemas.itemId.parse('0190a000-0000-7000-8000-000000000003'),
    filedAt: brandSchemas.instant.parse(3000),
    fields: {},
    position: design,
  });

  const limits = loaded.rules.limits.map((limit) => ({ ...limit, held: 0 }));
  const snapshot = buildMockSnapshot({ items: [unset, second, first], limits });
  const now = brandSchemas.instant.parse(50_000);
  const frame = buildFrame({ snapshot, rules: loaded.rules, now });
  const decision: unknown = decide({ frame, pools: loaded.rules.pools, snapshot, backoff: [] });

  expect(decision).toStrictEqual({
    picks: [
      expect.objectContaining({
        kind: 'start',
        item: first.id,
        pool: 'design-with-owner',
        limits: ['workers', 'owner-design'],
      }),
      expect.objectContaining({
        kind: 'start',
        item: unset.id,
        pool: 'design',
        limits: ['workers'],
      }),
    ],
    waits: [
      {
        subject: { kind: 'item', item: second.id },
        reason: { kind: 'limit-full', limit: 'owner-design' },
      },
    ],
  });
});

function setupTest() {
  const encoder = new TextEncoder();

  const prompts: [string, unknown][] = [
    ['triage-v1', triagePrompt],
    ['design-v1', designPrompt],
    ['design-attended-v1', designAttendedPrompt],
    ['build-v1', buildPrompt],
    ['review-run', reviewPrompt],
  ];

  const files = new Map([
    ['rules.yaml', encoder.encode(z.string().parse(exampleRules))],
    ...prompts.map(([name, text]): [string, Uint8Array] => [
      `prompts/${name}.md`,
      encoder.encode(z.string().parse(text)),
    ]),
  ]);

  // the four phase kinds are stand-ins with the outcome lists of the v1 phases
  const phases = [
    buildMockPhaseKind({ name: 'triage', outcomes: ['accepted', 'duplicate', 'declined'] }),
    buildMockPhaseKind({ name: 'design', outcomes: ['designed', 'blocked', 'abandoned'] }),
    buildMockPhaseKind({ name: 'build', outcomes: ['built', 'blocked', 'abandoned'] }),
    buildMockPhaseKind({ name: 'review', outcomes: ['passed', 'changes-requested', 'failed'] }),
  ];

  return {
    loadExample: () =>
      loadRules({
        checkout: { commit: '3f2a1c0', files },
        concepts,
        pins: conceptPins,
        phases,
        workers: [brandSchemas.workerKindName.parse('atc.session')],
      }),
  };
}
