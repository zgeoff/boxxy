import { brandSchemas } from '@boxxy/model';

// The pull request the fake forge holds under the number, with the GitHub ID that pepys keys it by
export function buildPullRequestRef(number: number) {
  return {
    ref: { repo: brandSchemas.repoName.parse('example/app'), number },
    githubId: 9_000_000 + number,
  };
}
