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

// atc 7.14.0 writes a refused call as `structuredContent: { code, problem? }` beside the text
// `<code>: <message>`. An older atc sends the text alone, so the code then comes from its prefix.
const atcWord = z.string().regex(/^[a-z][a-z_]{0,63}$/u);
const refusalSchema = z.object({ code: atcWord, problem: atcWord.optional() });
const textContentSchema = z.object({ type: z.literal('text'), text: z.string() });
const textRefusalPattern = /^(?<code>[a-z][a-z_]{0,63}): /u;
const maxMessageLength = 500;

function parseRefusal(
  content: readonly unknown[],
  structured: Readonly<Record<string, unknown>> | undefined,
): AtcCallError {
  const first = textContentSchema.safeParse(content[0]);
  const text = first.success ? first.data.text : '';
  const message = text.slice(0, maxMessageLength);

  if (structured === undefined) {
    return new AtcCallError(textRefusalPattern.exec(text)?.groups?.['code'] ?? 'refused', message);
  }

  const refusal = refusalSchema.safeParse(structured);

  return refusal.success
    ? new AtcCallError(refusal.data.code, message, refusal.data.problem ?? null)
    : new AtcCallError('refused', message);
}
