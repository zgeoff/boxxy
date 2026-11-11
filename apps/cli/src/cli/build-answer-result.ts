import { z } from 'zod';
import { exitCodes } from '../constants.ts';
import type { CLIResult } from '../types.ts';

// the answers that mean the server did not do what the command asked
const refusalSchema = z.object({ kind: z.enum(['refused', 'rejected', 'fault']) });

// The result of a command that prints the server's answer as JSON. A refusal prints the same
// text and exits with 1, so a script can branch on the exit code.
export function buildAnswerResult(answer: unknown): CLIResult {
  return {
    exitCode: refusalSchema.safeParse(answer).success ? exitCodes.failed : exitCodes.ok,
    stdout: `${JSON.stringify(answer, null, 2)}\n`,
    stderr: '',
  };
}

export function buildTextResult(text: string, exitCode: number = exitCodes.ok): CLIResult {
  return { exitCode, stdout: text === '' ? '' : `${text}\n`, stderr: '' };
}

export function buildErrorResult(message: string, exitCode: number = exitCodes.failed): CLIResult {
  return { exitCode, stdout: '', stderr: `${message}\n` };
}
