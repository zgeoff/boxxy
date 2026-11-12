import { match } from 'ts-pattern';
import { buildErrorResult, buildTextResult } from '../cli/build-answer-result.ts';
import { defaultSkillsURL, envNames } from '../constants.ts';
import type { CLIResult, CommandCall } from '../types.ts';
import { installSkills } from './install-skills.ts';
import { parseHookPayload, sessionStartPayloadSchema } from './parse-hook-payload.ts';
import { waitForAttempt } from './wait-for-attempt.ts';

// `boxxy hook session-start`. It asks which attempt the session carries, fetches the skills that
// the attempt's recipe lists at the rules' pin into the workspace, and binds the agent session to
// the attempt. A skill that is absent after the fetch goes to the server, which ends the attempt.
export async function runSessionStartHook(call: CommandCall): Promise<CLIResult> {
  const text = await call.deps.readStdin();

  const payload = parseHookPayload(sessionStartPayloadSchema, text);

  const current = await waitForAttempt(call.client, call.deps);

  if (current === null) {
    return buildErrorResult('boxxy has no attempt for this session');
  }

  const missing = await installSkills({
    pin: current.skills.pin,
    names: current.skills.names,
    workspace: payload.cwd,
    baseURL: call.deps.env[envNames.skillsURL] ?? defaultSkillsURL,
    runGit: call.deps.runGit,
  });

  const answer = await call.client.attempt.bindSession({
    session: {
      attempt: current.attempt.id,
      agentSession: payload.session_id,
      product: 'claude_code',
    },
    seenAt: new Date(call.deps.now()).toISOString(),
    missingSkills: missing.length === 0 ? undefined : missing,
  });

  return match(answer)
    .with({ kind: 'bound' }, () => buildTextResult(''))
    .with({ kind: 'skill-missing' }, () =>
      buildErrorResult(
        `boxxy ends this attempt: the skills ${missing.join(', ')} are not in the pinned skills repository`,
      ),
    )
    .with({ kind: 'no-attempt' }, { kind: 'not-current' }, (refused) =>
      buildErrorResult(`boxxy did not bind this session: ${refused.kind}`),
    )
    .with({ kind: 'fault' }, (fault) =>
      buildErrorResult(`this agent session is bound to attempt ${fault.holder}`),
    )
    .exhaustive();
}
