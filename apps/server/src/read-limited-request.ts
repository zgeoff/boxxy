import invariant from 'tiny-invariant';

// The request with its body read whole, or null when the body is over `maxBytes`. It stops
// reading at the first byte over the limit, so a streamed body with no length header cannot fill
// the memory: Bun's own body limit lets such a body through.
export async function readLimitedRequest(
  request: Request,
  maxBytes: number,
): Promise<Request | null> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) {
    return null;
  }

  if (request.body === null) {
    return request;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();

  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    const chunk: unknown = read.value;

    invariant(chunk instanceof Uint8Array, 'a request body streams bytes');

    total += chunk.byteLength;

    if (total > maxBytes) {
      await reader.cancel();

      return null;
    }

    chunks.push(chunk);
  }

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
}
