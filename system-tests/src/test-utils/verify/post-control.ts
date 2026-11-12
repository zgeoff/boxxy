import { WringerError } from '@wringer/core';
import { z } from 'zod';
import type { VerifyContext } from './verify-context.ts';

const errorBodySchema = z.object({ error: z.string() });

interface RouteSchemas<Request extends z.ZodType, Response extends z.ZodType> {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly request: Request;
  readonly response: Response;
}

// Calls one control route of the harness. The registry turns a 409 into `check-failed` with the
// harness's message, and no call retries.
export async function postControl<Request extends z.ZodType, Response extends z.ZodType>(
  ctx: VerifyContext,
  route: RouteSchemas<Request, Response>,
  body: z.input<Request>,
): Promise<z.output<Response>> {
  const sentBody: unknown = body;
  const hasBody = route.method !== 'GET' && sentBody !== null;

  const request = hasBody
    ? { method: route.method, path: route.path, json: sentBody }
    : { method: route.method, path: route.path };

  const answer = await ctx.drivers.http.request(request);

  if (answer.status !== 200) {
    const parsed = errorBodySchema.safeParse(answer.json);
    const message = parsed.success ? parsed.data.error : answer.body;
    const code = answer.status === 409 ? 'check-failed' : 'internal';

    throw new WringerError(code, {
      message: `${route.method} ${route.path} answered ${answer.status}: ${message}`,
    });
  }

  return route.response.parse(answer.json);
}
