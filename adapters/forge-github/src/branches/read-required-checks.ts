import type { RepoName } from '@boxxy/model';
import { forgeLimits } from '../constants.ts';
import type { GithubClient } from '../create-github-client.ts';
import { GithubForgeError } from '../github-forge-error.ts';
import { githubSchemas } from '../github-schemas.ts';
import { collectRequiredChecks } from './collect-required-checks.ts';

// GitHub answers the rules of any branch name, even one that does not exist, so the branch read
// is what makes a missing branch throw.
export async function readRequiredChecks(
  client: GithubClient,
  repo: RepoName,
  branch: string,
): Promise<readonly string[]> {
  const encoded = branch
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const branchPath = `/repos/${repo}/branches/${encoded}`;
  const rulesPath = `/repos/${repo}/rules/branches/${encoded}`;
  const maxRules = forgeLimits.maxRulePages * forgeLimits.pageSize;

  // one page past the limit shows whether GitHub holds more rules than the adapter reads
  const [rules, found] = await Promise.all([
    client.readPages(rulesPath, forgeLimits.maxRulePages + 1, githubSchemas.branchRulePage),
    client.readJson(branchPath, githubSchemas.branch),
  ]);

  if (rules.length > maxRules) {
    throw new GithubForgeError(
      `GitHub gave more than ${maxRules} rules for GET ${rulesPath}`,
      null,
    );
  }

  if (found === null) {
    throw new GithubForgeError(`GitHub did not find GET ${branchPath}`, 404);
  }

  return collectRequiredChecks(rules, found);
}
