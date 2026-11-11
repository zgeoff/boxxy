import { z } from 'zod';

const answerSchema = z
  .object({
    result: z.record(z.string(), z.unknown()).optional(),
    error: z.object({ code: z.number(), message: z.string() }).optional(),
  })
  .loose();

export type MCPAnswer = z.infer<typeof answerSchema>;

// The JSON-RPC answer of an MCP endpoint, from a JSON body or from the one event of a stream.
export async function readMCPAnswer(response: Response): Promise<MCPAnswer> {
  const text = await response.text();

  const isStream = (response.headers.get('content-type') ?? '').startsWith('text/event-stream');

  const json = isStream
    ? (text
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice('data: '.length) ?? '')
    : text;

  return answerSchema.parse(JSON.parse(json));
}
