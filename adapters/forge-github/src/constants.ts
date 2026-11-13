export const forgeLimits = {
  // GitHub's largest page size
  pageSize: 100,

  // 2,000 open pull requests of one repo; a deployment with more reads the first 2,000
  maxListPages: 20,

  // GitHub lists at most 250 commits of a pull request
  maxCommitPages: 3,

  // 300 check runs and 300 commit statuses at one head; a head with more reads the first 300
  maxCheckPages: 3,

  // 300 rules on one branch, from every ruleset that targets it
  maxRulePages: 3,
} as const;

export const apiVersion = '2022-11-28';
