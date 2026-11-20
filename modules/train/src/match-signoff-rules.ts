import type { ChangedPaths, MergeRules, PullRequestRef } from '@boxxy/model';
import picomatch from 'picomatch';

export interface SignoffMatch {
  // the names of the rules that matched
  readonly rules: readonly string[];

  // the changed paths that matched any matching rule, in the order given
  readonly paths: readonly string[];
}

// A rule matches when its `repos` is null or lists the pull request's repo, and any changed path
// matches any of its globs. A glob matches dot folders, is case-sensitive, and reads a backslash as part of a name on every host.
export function matchSignoffRules(
  rules: MergeRules['signoff'],
  pullRequest: PullRequestRef,
  changed: ChangedPaths,
): SignoffMatch {
  if (changed.kind === 'not-read') {
    return { rules: [], paths: [] };
  }

  const matched = rules.flatMap((rule) => {
    const covers = rule.repos === null || rule.repos.includes(pullRequest.repo);
    const isMatch = picomatch([...rule.paths], { dot: true, windows: false });
    const paths = covers ? changed.paths.filter((path) => isMatch(path)) : [];

    return paths.length === 0 ? [] : [{ name: rule.name, paths }];
  });

  return {
    rules: matched.map((entry) => entry.name),
    paths: changed.paths.filter((path) => matched.some((entry) => entry.paths.includes(path))),
  };
}
