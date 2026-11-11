import type { SinkAnswer } from '@boxxy/model';
import type { Result, SendFailure } from '@pepys/kit';

type SendResult = Result<{ stored: number }, SendFailure>;

// A refusal with 400, 413 or 422 is the batch's content, which a split can find. Ingest answers
// 500 when a source throws, it has no blob store, or its log refuses an append: no split fixes
// those, so a 500 blocks the outbox like any other refusal of the sink.
export function pickSinkAnswer(sent: SendResult | 'timeout', timeoutMs: number): SinkAnswer {
  if (sent === 'timeout') {
    return { kind: 'retry', reason: `no answer in ${timeoutMs} ms` };
  }

  if (sent.ok) {
    return { kind: 'stored' };
  }

  const failure = sent.failure;

  if (failure.kind === 'retry') {
    return { kind: 'retry', reason: failure.reason };
  }

  const status = failure.status;

  return status === 400 || status === 413 || status === 422
    ? { kind: 'refused-batch', status, reason: failure.reason }
    : { kind: 'refused-sink', status, reason: failure.reason };
}
