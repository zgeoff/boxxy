import type { z } from 'zod';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';

type BranchRule = z.infer<typeof githubSchemas.branchRulePage>[number];

type Branch = z.infer<typeof githubSchemas.branch>;

// The union of the checks that the branch's rulesets require and the checks that its classic
// protection requires, rulesets first, each name once. A required_status_checks rule of an
// unknown shape throws, because reading it as no check would let a merge skip a required check.
export function collectRequiredChecks(
  rules: readonly BranchRule[],
  branch: Branch,
): readonly string[] {
  const fromRules = rules
    .filter((rule) => rule.type === 'required_status_checks')
    .flatMap((rule) => {
      const parsed = githubSchemas.requiredStatusChecksRule.safeParse(rule.parameters);

      if (!parsed.success) {
        throw new GithubForgeError('GitHub gave an unknown required_status_checks rule', null);
      }

      return parsed.data.required_status_checks.map((check) => check.context);
    });

  const classic = branch.protection?.required_status_checks;

  const fromProtection =
    classic === undefined || classic.enforcement_level === 'off'
      ? []
      : [...classic.contexts, ...(classic.checks ?? []).map((check) => check.context)];

  return [...new Set([...fromRules, ...fromProtection])];
}
