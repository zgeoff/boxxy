import { UsageError } from '../cli/usage-error.ts';
import type { CommandCall } from '../types.ts';

// The body of `item file` and `item edit`, from `--body <text>` or `--body-file <path>`, where
// `-` reads stdin. Undefined when neither flag is given.
export function readItemBody(call: CommandCall): Promise<string | undefined> {
  const text = call.args.string('body');
  const path = call.args.string('body-file');

  if (text !== undefined && path !== undefined) {
    throw new UsageError('give --body or --body-file, not both');
  }

  if (path === undefined) {
    return Promise.resolve(text);
  }

  return path === '-' ? call.deps.readStdin() : call.deps.readFile(path);
}
