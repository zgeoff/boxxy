import type { z } from 'zod';
import type { CLIResult } from '../types.ts';

// What a command printed, parsed as JSON and then by the schema. The schema keeps the fields a
// test decides on.
export function readJSONOutput<Schema extends z.ZodType>(
  result: CLIResult,
  schema: Schema,
): z.output<Schema> {
  const output: unknown = JSON.parse(result.stdout);

  return schema.parse(output);
}
