import { expect, test } from 'bun:test';
import { GithubForgeError } from '../github-forge-error.ts';
import branchRules from '../test-utils/fixtures/branch-rules.json' with { type: 'json' };
import protectedBranch from '../test-utils/fixtures/protected-branch.json' with { type: 'json' };
import { collectRequiredChecks } from './collect-required-checks.ts';

test('it reads the union of the ruleset checks and the classic checks, rulesets first, each once', () => {
  expect(collectRequiredChecks(branchRules, protectedBranch)).toStrictEqual([
    'build',
    'verify / gate',
    'preview',
  ]);
});

test('it reads no classic checks from a branch whose protection does not enforce them', () => {
  const branch = {
    protection: { required_status_checks: { enforcement_level: 'off', contexts: ['build'] } },
  };

  expect(collectRequiredChecks([], branch)).toStrictEqual([]);
});

test('it reads no checks from a branch with no rules and no protection', () => {
  expect(collectRequiredChecks([{ type: 'deletion' }], {})).toStrictEqual([]);
});

test('it throws for a required_status_checks rule of an unknown shape', () => {
  const rules = [{ type: 'required_status_checks', parameters: { checks: ['build'] } }];

  expect(() => collectRequiredChecks(rules, {})).toThrowWithMessage(
    GithubForgeError,
    'GitHub gave an unknown required_status_checks rule',
  );
});
