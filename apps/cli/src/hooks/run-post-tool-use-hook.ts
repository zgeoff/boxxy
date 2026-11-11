import { match } from 'ts-pattern';
import { buildErrorResult, buildTextResult } from '../cli/build-answer-result.ts';
import type { CLIResult, CommandCall } from '../types.ts';
import { parseHookPayload, postToolUsePayloadSchema } from './parse-hook-payload.ts';
import { pickPullRequestURL } from './pick-pull-request-url.ts';
import { waitForAttempt } from './wait-for-attempt.ts';

// the exit code that makes Claude Code show stderr to the agent after a tool call
const tellAgent = 2;

// `boxxy hook post-tool-use`. It runs after every Bash call and does nothing unless the call was
// `gh pr create` and printed a pull request URL. It then links that pull request to the attempt.
export async function runPostToolUseHook(call: CommandCall): Promise<CLIResult> {
  const text = await call.deps.readStdin();

  const payload = parseHookPayload(postToolUsePayloadSchema, text);
  const url = pickPullRequestURL(payload);

  if (url === null) {
    return buildTextResult('');
  }

  const current = await waitForAttempt(call.client, call.deps);

  if (current === null) {
    return buildErrorResult('boxxy has no attempt for this session');
  }

  const answer = await call.client.attempt.recordPullRequest({
    session: { attempt: current.attempt.id },
    url,
  });

  return match(answer)
    .with({ kind: 'linked' }, (linked) =>
      buildTextResult(`boxxy linked ${linked.repo}#${linked.number} to this attempt`),
    )
    .with({ kind: 'retry' }, () =>
      buildTextResult('boxxy could not read the pull request now and links it later'),
    )
    .with({ kind: 'refused', reason: 'linked-elsewhere' }, () =>
      buildErrorResult('boxxy refused: this pull request belongs to another item', tellAgent),
    )
    .with({ kind: 'refused' }, (refused) => buildErrorResult(`boxxy refused: ${refused.reason}`))
    .exhaustive();
}
