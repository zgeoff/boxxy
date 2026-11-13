import { expect, test } from 'bun:test';
import { rulesFileName } from '@boxxy/rules';
import { buildExampleLoadInput } from '@boxxy/rules/test-utils/build-example-load-input';
import { buildJobRulesText } from './build-job-rules-text.ts';

test('it adds a merge step after review, its recipe, the merge rules and the jobs limit', () => {
  const example = buildExampleLoadInput().checkout.files.get(rulesFileName);

  const text = new TextDecoder().decode(example);

  const built = buildJobRulesText(text);

  expect([
    built.includes('    - phase: merge\n'),
    built.includes('  merge-v1:\n'),
    built.includes("  checks: ['pr / checks']\n"),
    built.includes('  - { name: jobs, max: 20, counts: { phase: merge } }\n'),
  ]).toStrictEqual([true, true, true, true]);
});

test('it throws on a rules file without the review step it adds the merge after', () => {
  expect(() => buildJobRulesText('kinds: {}\n')).toThrow(/the example rules hold/u);
});
