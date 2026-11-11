import { z } from 'zod';
import { UsageError } from '../cli/usage-error.ts';

// The fields of the JSON that Claude Code writes to a hook's stdin, as far as boxxy reads them.
// The other fields are dropped.
export const sessionStartPayloadSchema = z.object({
  session_id: z.string().min(1),
  cwd: z.string().min(1),
});

// the Bash tool answers with an object that holds `stdout`
const bashResponseSchema = z.object({ stdout: z.string().optional() });
const toolResponseSchema = z.union([z.string(), bashResponseSchema]);
const toolInputSchema = z.object({ command: z.string().optional() });

export const postToolUsePayloadSchema = z.object({
  tool_name: z.string(),
  tool_input: toolInputSchema.optional(),
  tool_response: toolResponseSchema.optional(),
});

export type PostToolUsePayload = z.infer<typeof postToolUsePayloadSchema>;

export function parseHookPayload<Schema extends z.ZodType>(
  schema: Schema,
  text: string,
): z.output<Schema> {
  const body = parseJSON(text);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    const problem = parsed.error.message;

    throw new UsageError(`the hook payload on stdin is not the one expected: ${problem}`);
  }

  return parsed.data;
}

function parseJSON(text: string): unknown {
  try {
    const payload: unknown = JSON.parse(text);

    return payload;
  } catch {
    throw new UsageError('the hook payload on stdin is not JSON');
  }
}
