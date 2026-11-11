import { expect, test } from 'bun:test';
import { outboxLimits } from './constants.ts';
import { pickSenderMove } from './pick-sender-move.ts';
import type { SenderMove } from './types.ts';

test.each<[string, Omit<Parameters<typeof pickSenderMove>[0], 'limits'>, SenderMove]>([
  ['stored', { answer: { kind: 'stored' }, batchSize: 5, parkRun: 0 }, { kind: 'mark-sent' }],
  [
    'retry',
    { answer: { kind: 'retry', reason: 'HTTP 503' }, batchSize: 5, parkRun: 0 },
    { kind: 'retry-same' },
  ],
  [
    'retry of one row',
    { answer: { kind: 'retry', reason: 'timeout' }, batchSize: 1, parkRun: 3 },
    { kind: 'retry-same' },
  ],
  [
    '413 of a batch of more than one row',
    { answer: { kind: 'refused-batch', status: 413, reason: 'too big' }, batchSize: 2, parkRun: 0 },
    { kind: 'split' },
  ],
  [
    '400 of a batch of more than one row',
    { answer: { kind: 'refused-batch', status: 400, reason: 'bad' }, batchSize: 100, parkRun: 0 },
    { kind: 'split' },
  ],
  [
    '422 of a batch of more than one row',
    { answer: { kind: 'refused-batch', status: 422, reason: 'bad' }, batchSize: 3, parkRun: 0 },
    { kind: 'split' },
  ],
  [
    '413 of one row',
    { answer: { kind: 'refused-batch', status: 413, reason: 'too big' }, batchSize: 1, parkRun: 0 },
    { kind: 'park', reason: 'too-large' },
  ],
  [
    '400 of one row',
    {
      answer: { kind: 'refused-batch', status: 400, reason: 'missing field' },
      batchSize: 1,
      parkRun: 0,
    },
    { kind: 'park', reason: 'missing field' },
  ],
  [
    '422 of one row',
    {
      answer: { kind: 'refused-batch', status: 422, reason: 'bad payload' },
      batchSize: 1,
      parkRun: 24,
    },
    { kind: 'park', reason: 'bad payload' },
  ],
  [
    '422 of one row after 25 rows parked in a row',
    {
      answer: { kind: 'refused-batch', status: 422, reason: 'bad payload' },
      batchSize: 1,
      parkRun: 25,
    },
    { kind: 'block', reason: 'pepys refuses every fact' },
  ],
  [
    '401 of the sink',
    {
      answer: { kind: 'refused-sink', status: 401, reason: 'wrong secret' },
      batchSize: 5,
      parkRun: 0,
    },
    { kind: 'block', reason: 'wrong secret' },
  ],
  [
    '404 of the sink, for one row',
    { answer: { kind: 'refused-sink', status: 404, reason: 'no route' }, batchSize: 1, parkRun: 0 },
    { kind: 'block', reason: 'no route' },
  ],
])('it answers %s with the move', (_title, input, move) => {
  expect(pickSenderMove({ ...input, limits: outboxLimits })).toStrictEqual(move);
});
