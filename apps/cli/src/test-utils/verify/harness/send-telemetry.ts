import type { AttemptId } from '@boxxy/model';
import invariant from 'tiny-invariant';
import type { VerifyHarness } from './types.ts';

const minuteMs = 60_000;

interface ModelRequest {
  readonly attempt: AttemptId;

  // minutes after the current item was set
  readonly minute: number;
  readonly costUSD: number;
}

// One model request from the session of each given attempt, from the caller of that session.
export async function sendTelemetry(
  harness: VerifyHarness,
  requests: readonly ModelRequest[],
): Promise<void> {
  const rows = await Promise.all(
    requests.map(async (request) => {
      const attempt = await harness.server.dispatch.readAttempt(request.attempt);

      invariant(attempt.atcSession !== null && attempt.caller !== null, 'the attempt started');

      return {
        id: `request-${attempt.id}`,
        session: attempt.atcSession,
        origin: attempt.caller,
        model: 'claude-opus-5-5',
        costUSD: request.costUSD,
        inputTokens: 1000,
        outputTokens: 200,
        at: new Date(harness.currentSince + request.minute * minuteMs).toISOString(),
      };
    }),
  );

  await harness.pepys.sendTelemetry(rows);
}
