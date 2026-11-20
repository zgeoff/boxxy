import type { MergeRules, RepoName } from '@boxxy/model';

// Whether some sign-off rule covers the repo, so that the merge job has to read the changed paths.
export function isSignoffCovered(rules: MergeRules | null, repo: RepoName): boolean {
  return rules?.signoff.some((rule) => rule.repos === null || rule.repos.includes(repo)) === true;
}
