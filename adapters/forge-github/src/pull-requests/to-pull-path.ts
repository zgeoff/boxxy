import type { PullRequestRef } from '@boxxy/model';
import { GithubForgeError } from '../github-forge-error.ts';

export function toPullPath(ref: PullRequestRef): string {
  if (!Number.isInteger(ref.number) || ref.number < 1) {
    throw new GithubForgeError(`not a pull request number: ${ref.number}`, null);
  }

  return `/repos/${ref.repo}/pulls/${ref.number}`;
}
