import { UsageError } from '../cli/usage-error.ts';
import type { CommandCall } from '../types.ts';

// The findings of `item signoff`, from `--findings <text>` or `--findings-file <path>`, where `-`
// reads stdin. Undefined when neither flag is given.
export function readFindings(call: CommandCall): Promise<string | undefined> {
  const text = call.args.string('findings');
  const path = call.args.string('findings-file');

  if (text !== undefined && path !== undefined) {
    throw new UsageError('give --findings or --findings-file, not both');
  }

  if (path === undefined) {
    return Promise.resolve(text);
  }

  return path === '-' ? call.deps.readStdin() : call.deps.readFile(path);
}
