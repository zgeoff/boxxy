import { AtcCallError } from './atc-call-error.ts';

// A response whose body fails as `malformed_answer` past `maxBytes`, before any parse reads it: by
// its `content-length` at once, and by the bytes the stream has counted for a body without one.
export function toCappedResponse(response: Response, maxBytes: number): Response {
  const declared = Number(response.headers.get('content-length') ?? '0');

  if (declared > maxBytes) {
    throw buildOversizedError(maxBytes);
  }

  if (response.body === null) {
    return response;
  }

  let counted = 0;

  const cap = new TransformStream<Uint8Array, Uint8Array>({
    transform: (chunk, controller) => {
      counted += chunk.byteLength;

      if (counted > maxBytes) {
        controller.error(buildOversizedError(maxBytes));

        return;
      }

      controller.enqueue(chunk);
    },
  });

  return new Response(response.body.pipeThrough(cap), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function buildOversizedError(maxBytes: number): AtcCallError {
  return new AtcCallError('malformed_answer', `atc answered with a body over ${maxBytes} bytes`);
}
