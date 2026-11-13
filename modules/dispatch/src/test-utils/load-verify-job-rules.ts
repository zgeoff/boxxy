import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type { LoadedRules } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { buildJobRulesText } from './build-job-rules-text.ts';
import { createFakeReviewGate } from './create-fake-review-gate.ts';

// The job rules with a `verify` step between review and merge, graded by the builder's kept
// session. A failed verify goes back to build, and an `unverified` merge goes back to verify.
export function loadVerifyJobRules(): LoadedRules {
  const example = buildExampleLoadInput();

  const text = new TextDecoder().decode(example.checkout.files.get(rulesFileName));
  const rulesText = new TextEncoder().encode(buildVerifyJobRulesText(buildJobRulesText(text)));

  const loaded = loadRules({
    ...example,
    checkout: {
      ...example.checkout,
      files: new Map([...example.checkout.files, [rulesFileName, rulesText]]),
    },
    workers: [...example.workers, brandSchemas.workerKindName.parse('merge.forge')],
    concepts,
    pins: conceptPins,
    phases: [...phaseKinds, createReviewPhase(createFakeReviewGate())],
  });

  invariant(loaded.kind === 'loaded', `the verify job rules load: ${JSON.stringify(loaded)}`);

  return loaded.rules;
}

const replacements: readonly (readonly [string, string])[] = [
  [
    '    - phase: merge\n',
    [
      '    - phase: verify\n',
      '      maxAttempts: 2\n',
      '      timeoutMinutes: 90\n',
      '      on:\n',
      '        verified: next\n',
      '        failed: { to: build, max: 2, resume: true }\n',
      '        blocked: { hold: blocked }\n',
      '        abandoned: again\n',
      '    - phase: merge\n',
    ].join(''),
  ],
  ['        unverified: { to: review, max: 2 }\n', '        unverified: { to: verify, max: 2 }\n'],
  ['      merge: merge-v1\n', '      verify: verify-v1\n      merge: merge-v1\n'],
  [
    'counts: { phase: [triage, design, build, review] }',
    'counts: { phase: [triage, design, build, review, verify] }',
  ],
  [
    '  - { name: merge, takes: { phase: merge }, order: [oldest] }\n',
    [
      '  - { name: verify, takes: { phase: verify }, order: [oldest] }\n',
      '  - { name: merge, takes: { phase: merge }, order: [oldest] }\n',
    ].join(''),
  ],
  [
    "recipes: # the pin and each recipe's skills are part of the recipe hash\n",
    [
      "recipes: # the pin and each recipe's skills are part of the recipe hash\n",
      '  verify-v1:\n',
      '    agent: claude\n',
      '    model: claude-opus-5-5\n',
      '    effort: medium\n',
      '    prompt: prompts/review-run.md\n',
      '    source: subscription\n',
      '    session: builder\n',
      '    skills: []\n',
    ].join(''),
  ],
];

function buildVerifyJobRulesText(text: string): string {
  return replacements.reduce((rules, [from, to]) => {
    invariant(rules.includes(from), `the job rules hold ${from}`);

    return rules.replaceAll(from, to);
  }, text);
}
