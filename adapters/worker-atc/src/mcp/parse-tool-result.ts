import { z } from 'zod';
import { AtcCallError } from './atc-call-error.ts';

export type ParsedToolResult<Value> =
  | { readonly kind: 'answered'; readonly value: Value }
  | { readonly kind: 'refused'; readonly error: AtcCallError };

const toolResultSchema = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.unknown()).optional(),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
});

// Reads an atc tool result: a refusal as its code, its problem and its message, and an answer only
// through the tool's schema, so a result that fails the schema is refused and never trusted.
export function parseToolResult<Schema extends z.ZodType>(
  tool: string,
  result: unknown,
  schema: Schema,
): ParsedToolResult<z.output<Schema>> {
  const parsed = toolResultSchema.safeParse(result);

  if (!parsed.success) {
    return { kind: 'refused', error: buildMalformedError(tool) };
  }

  if (parsed.data.isError === true) {
    return {
      kind: 'refused',
      error: parseRefusal(parsed.data.content ?? [], parsed.data.structuredContent),
    };
  }

  const value = schema.safeParse(parsed.data.structuredContent);

  return value.success
    ? { kind: 'answered', value: value.data }
    : { kind: 'refused', error: buildMalformedError(tool) };
}

function buildMalformedError(tool: string): AtcCallError {
  return new AtcCallError(
    'malformed_answer',
    `atc answered ${tool} with a result boxxy cannot read`,
  );
}

// atc writes a refused call as `structuredContent: { code, problem? }`, beside a text for people.
// The adapter reads the code and the problem from the structured part only, and keeps the text as
// the message.
const atcWord = z.string().regex(/^[a-z][a-z_]{0,63}$/u);
const refusalSchema = z.object({ code: atcWord, problem: atcWord.optional() });
const textContentSchema = z.object({ type: z.literal('text'), text: z.string() });
const maxMessageLength = 500;

function parseRefusal(
  content: readonly unknown[],
  structured: Readonly<Record<string, unknown>> | undefined,
): AtcCallError {
  const first = textContentSchema.safeParse(content[0]);
  const message = (first.success ? first.data.text : '').slice(0, maxMessageLength);
  const refusal = refusalSchema.safeParse(structured);

  return refusal.success
    ? new AtcCallError(refusal.data.code, message, refusal.data.problem ?? null)
    : new AtcCallError('refused', message);
}
