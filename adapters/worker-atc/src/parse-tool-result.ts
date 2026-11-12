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

// Reads an atc tool result: a refusal as its code and message, and an answer only through the
// tool's schema, so a result that fails the schema is refused and never trusted.
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
    return { kind: 'refused', error: parseRefusal(parsed.data.content ?? []) };
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

const textContentSchema = z.object({ type: z.literal('text'), text: z.string() });

// atc writes a refused call as the text `<code>: <message>`
const refusalPattern = /^(?<code>[a-z][a-z_]{0,63}): (?<message>[\s\S]*)$/u;
const maxMessageLength = 500;

function parseRefusal(content: readonly unknown[]): AtcCallError {
  const first = textContentSchema.safeParse(content[0]);
  const text = first.success ? first.data.text : '';
  const groups = refusalPattern.exec(text)?.groups;
  const code = groups?.['code'] ?? 'refused';
  const message = groups?.['message'] ?? text;

  return new AtcCallError(code, message.slice(0, maxMessageLength));
}
