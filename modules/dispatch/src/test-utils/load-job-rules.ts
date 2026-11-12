import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type { DriveContext, JobStep, LoadedRules } from '@boxxy/model';
import { brandSchemas, definePhase, mergeCloseOutSchema, toJSONValue } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { createFakeReviewGate } from './create-fake-review-gate.ts';

// The example rules with a `merge` step after review, on the job worker `merge.forge`, and the
// review phase kind on a fake review gate. The `workers` limit counts the session phases and the
// `jobs` limit counts the merges.
export function loadJobRules(drive: (ctx: DriveContext) => JobStep): LoadedRules {
  const example = buildExampleLoadInput();

  const text = new TextDecoder().decode(example.checkout.files.get(rulesFileName));
  const jobText = new TextEncoder().encode(buildJobRulesText(text));

  const loaded = loadRules({
    ...example,
    checkout: {
      ...example.checkout,
      files: new Map([...example.checkout.files, [rulesFileName, jobText]]),
    },
    workers: [...example.workers, brandSchemas.workerKindName.parse('merge.forge')],
    concepts,
    pins: conceptPins,
    phases: [...phaseKinds, createReviewPhase(createFakeReviewGate()), buildMergePhase(drive)],
  });

  invariant(loaded.kind === 'loaded', `the job rules load: ${JSON.stringify(loaded)}`);

  return loaded.rules;
}

const replacements: readonly (readonly [string, string])[] = [
  ['        passed: { end: reviewed }\n', '        passed: next\n'],
  [
    '        failed: again # a failed call or a result that covers no head runs once more\n',
    [
      '        failed: again # a failed call or a result that covers no head runs once more\n',
      '    - phase: merge\n',
      '      maxAttempts: 2\n',
      '      timeoutMinutes: 240\n',
      '      on:\n',
      '        merged: { end: merged }\n',
      '        repair: { to: build, max: 3, resume: true }\n',
      '        stale: { to: review, max: 3 }\n',
      '        unverified: { to: review, max: 2 }\n',
      '        closed: { hold: pull-request-closed }\n',
      '        stalled: { hold: checks-stalled }\n',
      '        refused: { hold: merge-refused }\n',
    ].join(''),
  ],
  ['      review: review-run\n', '      review: review-run\n      merge: merge-v1\n'],
  [
    '  - { name: workers, max: 7, counts: {} }\n',
    [
      '  - { name: workers, max: 7, counts: { phase: [triage, design, build, review] } }\n',
      '  - { name: jobs, max: 20, counts: { phase: merge } }\n',
    ].join(''),
  ],
  [
    '  - { name: build, takes: { phase: build }, order: [oldest] }\n',
    [
      '  - { name: build, takes: { phase: build }, order: [oldest] }\n',
      '  - { name: merge, takes: { phase: merge }, order: [oldest] }\n',
    ].join(''),
  ],
  [
    'limits:\n',
    ['merge:\n', '  method: squash\n', "  checks: ['pr / checks']\n", '\n', 'limits:\n'].join(''),
  ],
  [
    "recipes: # the pin and each recipe's skills are part of the recipe hash\n",
    [
      "recipes: # the pin and each recipe's skills are part of the recipe hash\n",
      '  merge-v1:\n',
      '    agent: claude\n',
      '    model: claude-opus-5-5\n',
      '    effort: medium\n',
      '    prompt: prompts/review-run.md\n',
      '    source: subscription\n',
      '    skills: []\n',
    ].join(''),
  ],
];

function buildJobRulesText(text: string): string {
  return replacements.reduce((rules, [from, to]) => {
    invariant(rules.includes(from), `the example rules hold ${from}`);

    return rules.replaceAll(from, to);
  }, text);
}

function buildMergePhase(drive: (ctx: DriveContext) => JobStep) {
  return definePhase({
    name: brandSchemas.phaseName.parse('merge'),
    version: 1,
    worker: brandSchemas.workerKindName.parse('merge.forge'),
    outcomes: ['merged', 'repair', 'stale', 'unverified', 'closed', 'stalled', 'refused'],
    needsAcceptance: false,
    input: () => toJSONValue({}),
    drive,
    closeOut: {
      parse: (raw) => {
        const parsed = mergeCloseOutSchema.safeParse(raw);

        return parsed.success
          ? { kind: 'valid', closeOut: parsed.data }
          : {
              kind: 'invalid',
              problems: [{ kind: 'schema', path: '', message: parsed.error.message }],
            };
      },
      jsonSchema: {},
    },
    settle: (input) => ({
      state: input.closeOut.outcome === 'merged' ? 'succeeded' : 'failed',
      failure: input.closeOut.outcome === 'merged' ? null : input.closeOut.outcome,
      outcome: input.closeOut.outcome,
      effects: [],
      frictionDropped: 0,
    }),
  });
}
