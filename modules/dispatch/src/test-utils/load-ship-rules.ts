import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type { LoadedRules } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { createShippedWaitKind } from '../ships/create-shipped-wait-kind.ts';
import { buildJobRulesText } from './build-job-rules-text.ts';
import { createFakeReviewGate } from './create-fake-review-gate.ts';

const mergeWorker = brandSchemas.workerKindName.parse('merge.forge');

export interface ShipRulesInput {
  // the lines of the `repos` section, each indented two spaces
  readonly repos: readonly string[];
}

// The job rules with a last `verify` step after the merge, tagged `prod`, that waits on `shipped`
// and skips to the end `merged`; the `verify` step stands in for the step of a phase that checks
// shipped work.
export function loadShipRules(input: ShipRulesInput): LoadedRules {
  const example = buildExampleLoadInput();

  const text = new TextDecoder().decode(example.checkout.files.get(rulesFileName));
  const shipText = new TextEncoder().encode(buildShipRulesText(buildJobRulesText(text), input));

  const loaded = loadRules({
    ...example,
    checkout: {
      ...example.checkout,
      files: new Map([...example.checkout.files, [rulesFileName, shipText]]),
    },
    workers: [...example.workers, mergeWorker],
    waits: [createShippedWaitKind(mergeWorker)],
    concepts,
    pins: conceptPins,
    phases: [...phaseKinds, createReviewPhase(createFakeReviewGate())],
  });

  invariant(loaded.kind === 'loaded', `the ship rules load: ${JSON.stringify(loaded)}`);

  return loaded.rules;
}

function buildShipRulesText(text: string, input: ShipRulesInput): string {
  const replacements: readonly (readonly [string, string])[] = [
    [
      'criterionTags: [prod] # the only tags that an acceptance line may carry\n',
      ['criterionTags: [prod]\n', 'repos:\n', ...input.repos.map((line) => `${line}\n`)].join(''),
    ],
    ['        merged: { end: merged }\n', '        merged: next\n'],
    [
      '        blocked: { hold: merge-blocked }\n',
      [
        '        blocked: { hold: merge-blocked }\n',
        '    - phase: verify\n',
        '      maxAttempts: 2\n',
        '      timeoutMinutes: 90\n',
        '      criteria: { tagged: prod }\n',
        '      waits: [shipped]\n',
        '      skip: { end: merged }\n',
        '      on:\n',
        '        verified: { end: verified }\n',
        '        failed: { end: verify-failed }\n',
        '        blocked: { hold: blocked }\n',
        '        abandoned: again\n',
      ].join(''),
    ],
    ['      merge: merge-v1\n', '      merge: merge-v1\n      verify: verify-v1\n'],
    [
      'counts: { phase: [triage, design, build, review] }',
      'counts: { phase: [triage, design, build, review, verify] }',
    ],
    [
      '  - { name: merge, takes: { phase: merge }, order: [oldest] }\n',
      [
        '  - { name: merge, takes: { phase: merge }, order: [oldest] }\n',
        '  - { name: verify, takes: { phase: verify }, order: [oldest] }\n',
      ].join(''),
    ],
    [
      '  merge-v1:\n',
      [
        '  verify-v1:\n',
        '    agent: claude\n',
        '    model: claude-opus-5-5\n',
        '    effort: medium\n',
        '    prompt: prompts/review-run.md\n',
        '    source: subscription\n',
        '    skills: []\n',
        '  merge-v1:\n',
      ].join(''),
    ],
  ];

  return replacements.reduce((rules, [from, to]) => {
    invariant(rules.includes(from), `the job rules hold ${from}`);

    return rules.replaceAll(from, to);
  }, text);
}
