import { expect, test } from 'bun:test';
import type { HttpRequest } from '@wringer/http';
import { controlRoutes } from './harness/control-routes.ts';
import { postControl } from './post-control.ts';
import type { VerifyContext } from './verify-context.ts';

interface HarnessAnswer {
  readonly status: number;
  readonly json: unknown;
  readonly body?: string;
}

function setupTest(answer: HarnessAnswer) {
  const requests: HttpRequest[] = [];

  const ctx: VerifyContext = {
    exec: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
    endpoints: {},
    drivers: {
      http: {
        request: (request) => {
          requests.push(request);

          return Promise.resolve({
            status: answer.status,
            headers: {},
            body: answer.body ?? JSON.stringify(answer.json),
            json: answer.json,
          });
        },
      },
    },
  };

  return { ctx, requests };
}

test('#postControl posts the body and parses the answer', async () => {
  const ctx = setupTest({ status: 200, json: { clock: '2026-01-01T00:00:00.000Z' } });

  const answer = await postControl(ctx.ctx, controlRoutes.advanceClock, { minutes: 3 });

  expect({ answer, requests: ctx.requests }).toStrictEqual({
    answer: { clock: '2026-01-01T00:00:00.000Z' },
    requests: [{ method: 'POST', path: '/control/clock', json: { minutes: 3 } }],
  });
});

test('#postControl sends a GET with no body', async () => {
  const ctx = setupTest({ status: 200, json: { item: 'i-1' } });

  await postControl(ctx.ctx, controlRoutes.readCurrent, null);

  expect(ctx.requests).toStrictEqual([{ method: 'GET', path: '/control/current' }]);
});

test('#postControl turns a 409 into check-failed with the harness message', async () => {
  const ctx = setupTest({ status: 409, json: { error: 'no current item' } });
  const failure = postControl(ctx.ctx, controlRoutes.readCurrent, null);

  await expect(failure).rejects.toMatchObject({
    code: 'check-failed',
    message: 'GET /control/current answered 409: no current item',
  });
});

test('#postControl turns any other refusal into internal', async () => {
  const ctx = setupTest({ status: 500, json: 'boom', body: 'boom' });
  const failure = postControl(ctx.ctx, controlRoutes.readCurrent, null);

  await expect(failure).rejects.toMatchObject({ code: 'internal' });
});
