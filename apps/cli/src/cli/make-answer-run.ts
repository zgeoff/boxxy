import type { Command, CommandCall } from '../types.ts';
import { buildAnswerResult } from './build-answer-result.ts';

// The `run` of a command that sends one call and prints the server's answer as JSON.
export function makeAnswerRun(send: (call: CommandCall) => Promise<unknown>): Command['run'] {
  return async (call) => {
    const answer = await send(call);

    return buildAnswerResult(answer);
  };
}
