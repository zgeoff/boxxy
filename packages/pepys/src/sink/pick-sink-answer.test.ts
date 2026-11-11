import { expect, test } from 'bun:test';
import { pickSinkAnswer } from './pick-sink-answer.ts';

test('it answers stored for a batch that ingest stored', () => {
  expect(pickSinkAnswer({ ok: true, value: { stored: 3 } }, 10_000)).toStrictEqual({
    kind: 'stored',
  });
});

test('it answers retry with the sender reason for a retry', () => {
  const answer = pickSinkAnswer(
    { ok: false, failure: { kind: 'retry', reason: 'ingest answered 503: busy' } },
    10_000,
  );

  expect(answer).toStrictEqual({ kind: 'retry', reason: 'ingest answered 503: busy' });
});

test('it answers retry for a send that timed out', () => {
  expect(pickSinkAnswer('timeout', 10_000)).toStrictEqual({
    kind: 'retry',
    reason: 'no answer in 10000 ms',
  });
});

test.each([400, 413, 422] as const)('it answers refused-batch for a refusal with %i', (status) => {
  const answer = pickSinkAnswer(
    { ok: false, failure: { kind: 'refused', status, reason: 'a bad fact' } },
    10_000,
  );

  expect(answer).toStrictEqual({ kind: 'refused-batch', status, reason: 'a bad fact' });
});

test.each([401, 404, 405, 500, 302])('it answers refused-sink for a refusal with %i', (status) => {
  const answer = pickSinkAnswer(
    { ok: false, failure: { kind: 'refused', status, reason: 'set up wrong' } },
    10_000,
  );

  expect(answer).toStrictEqual({ kind: 'refused-sink', status, reason: 'set up wrong' });
});
