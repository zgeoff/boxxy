import { ORPCError } from '@orpc/client';
import { allCommands } from '../commands/all-commands.ts';
import { exitCodes, packageVersion } from '../constants.ts';
import { createClient } from '../create-client.ts';
import type { CLIDeps, CLIResult } from '../types.ts';
import { buildErrorResult, buildTextResult } from './build-answer-result.ts';
import { formatHelp } from './format-help.ts';
import { parseCommandArgs } from './parse-command-args.ts';
import { pickCommand } from './pick-command.ts';
import { UsageError } from './usage-error.ts';

// Runs one command line and returns what to print and the exit code. It prints and exits nothing,
// so a test calls it with the server's listener as `deps.send`.
export async function runCLI(deps: CLIDeps, argv: readonly string[]): Promise<CLIResult> {
  const picked = pickCommand(allCommands, argv);

  if (picked.kind === 'help') {
    return buildTextResult(formatHelp(allCommands, picked.prefix));
  }

  if (picked.kind === 'version') {
    return buildTextResult(packageVersion);
  }

  if (picked.kind === 'unknown') {
    return buildErrorResult(`unknown command: ${picked.word}`, exitCodes.usage);
  }

  try {
    const args = parseCommandArgs(picked.command, picked.words);

    return await picked.command.run({ client: createClient(deps), args, deps });
  } catch (error) {
    return describeFailure(error);
  }
}

function describeFailure(error: unknown): CLIResult {
  if (error instanceof UsageError) {
    return buildErrorResult(`error: ${error.message}`, exitCodes.usage);
  }

  if (error instanceof ORPCError) {
    const data = error.data === undefined ? '' : ` ${JSON.stringify(error.data)}`;

    return buildErrorResult(`error: ${error.code}: ${error.message}${data}`);
  }

  return buildErrorResult(`error: ${error instanceof Error ? error.message : String(error)}`);
}
