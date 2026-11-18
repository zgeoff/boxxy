import { createReviewPhase, phaseKinds } from '@boxxy/closeout';
import type { LoadedRules } from '@boxxy/model';
import { conceptPins, concepts } from '@boxxy/planning';
import { loadRules, rulesFileName } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import invariant from 'tiny-invariant';
import { createFakeReviewGate } from './create-fake-review-gate.ts';

export interface VerifyRulesInput {
  // the grader of the verify recipe that both kinds run
  readonly session: 'builder' | 'fresh';

  // false: no edge of the pipeline carries `resume: true`, so only the grader keeps a session
  readonly resume: boolean;

  // criterion tags for the file, and the gate lines of the review and verify steps, each line
  // indented as a key of the step
  readonly gates?: {
    readonly criterionTags: readonly string[];
    readonly review?: readonly string[];
    readonly verify?: readonly string[];
  };
}

// The example rules with a `verify` step after review, on a `verify-v1` recipe. A failed verify
// goes back to build, and a verified one ends the item.
export function loadVerifyRules(input: VerifyRulesInput): LoadedRules {
  const example = buildExampleLoadInput();

  const text = new TextDecoder().decode(example.checkout.files.get(rulesFileName));
  const verifyText = new TextEncoder().encode(buildVerifyRulesText(text, input));

  const loaded = loadRules({
    ...example,
    checkout: {
      ...example.checkout,
      files: new Map([...example.checkout.files, [rulesFileName, verifyText]]),
    },
    concepts,
    pins: conceptPins,
    phases: [...phaseKinds, createReviewPhase(createFakeReviewGate())],
  });

  invariant(loaded.kind === 'loaded', `the verify rules load: ${JSON.stringify(loaded)}`);

  return loaded.rules;
}

function buildVerifyRulesText(text: string, input: VerifyRulesInput): string {
  const resume = input.resume ? ', resume: true' : '';

  const replacements: readonly (readonly [string, string])[] = [
    ['        passed: { end: reviewed }\n', '        passed: next\n'],
    [
      '        changes-requested: { to: build, max: 3, resume: true }',
      `        changes-requested: { to: build, max: 3${resume} }`,
    ],
    [
      '        failed: again # a failed call or a result that covers no head runs once more\n',
      [
        '        failed: again\n',
        '    - phase: verify\n',
        '      maxAttempts: 2\n',
        '      timeoutMinutes: 90\n',
        '      on:\n',
        '        verified: { end: verified }\n',
        `        failed: { to: build, max: 2${resume} }\n`,
        '        blocked: { hold: blocked }\n',
        '        abandoned: again\n',
      ].join(''),
    ],
    ['      review: review-run\n', '      review: review-run\n      verify: verify-v1\n'],
    [
      '  - { name: build, takes: { phase: build }, order: [oldest] }\n',
      [
        '  - { name: build, takes: { phase: build }, order: [oldest] }\n',
        '  - { name: verify, takes: { phase: verify }, order: [oldest] }\n',
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
        `    session: ${input.session}\n`,
        '    skills: []\n',
      ].join(''),
    ],
  ];

  const gated =
    input.gates === undefined
      ? replacements
      : [...replacements, ...buildGateReplacements(input.gates)];

  return gated.reduce((rules, [from, to]) => {
    invariant(rules.includes(from), `the example rules hold ${from}`);

    return rules.replaceAll(from, to);
  }, text);
}

function buildGateReplacements(
  gates: NonNullable<VerifyRulesInput['gates']>,
): readonly (readonly [string, string])[] {
  const review = (gates.review ?? []).map((line) => `${line}\n`).join('');
  const verify = (gates.verify ?? []).map((line) => `${line}\n`).join('');

  return [
    [
      'criterionTags: [prod] # the only tags that an acceptance line may carry\n',
      `criterionTags: [${gates.criterionTags.join(', ')}]\n`,
    ],
    ['      timeoutMinutes: 45\n', `      timeoutMinutes: 45\n${review}`],
    [
      '      timeoutMinutes: 90\n      on:\n        verified:',
      `      timeoutMinutes: 90\n${verify}      on:\n        verified:`,
    ],
  ];
}
