import invariant from 'tiny-invariant';

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
      '        blocked: { hold: merge-blocked }\n',
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

// The example rules file with a `merge` step after review, its recipe and merge rules, a `jobs`
// limit for the merges, and a `workers` limit that counts the session phases only.
export function buildJobRulesText(text: string): string {
  return replacements.reduce((rules, [from, to]) => {
    invariant(rules.includes(from), `the example rules hold ${from}`);

    return rules.replaceAll(from, to);
  }, text);
}
