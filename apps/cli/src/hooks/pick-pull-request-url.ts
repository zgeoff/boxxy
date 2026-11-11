import type { PostToolUsePayload } from './parse-hook-payload.ts';

const createCommandPattern = /\bgh\s+pr\s+create\b/u;
const pullRequestURLPattern = /https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/\d+/gu;

// The pull request that a `gh pr create` call printed, or null for any other tool call. `gh`
// prints the new pull request's URL last.
export function pickPullRequestURL(payload: PostToolUsePayload): string | null {
  if (payload.tool_name !== 'Bash') {
    return null;
  }

  if (!createCommandPattern.test(payload.tool_input?.command ?? '')) {
    return null;
  }

  const response = payload.tool_response;
  const stdout = typeof response === 'string' ? response : (response?.stdout ?? '');

  return stdout.match(pullRequestURLPattern)?.at(-1) ?? null;
}
