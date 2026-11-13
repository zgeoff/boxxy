import { expect, test } from 'bun:test';
import { formatGateAnnotations } from './format-gate-annotations.ts';

test('it writes no annotation for a passed gate', () => {
  expect(formatGateAnnotations({ kind: 'passed' })).toStrictEqual([]);
});

test('it writes one annotation per failing feature and per unmapped path', () => {
  const annotations = formatGateAnnotations({
    kind: 'failed',
    failing: [
      { name: 'file-item', reason: 'no verdict in the report' },
      { name: 'report-cost', reason: 'verdict at abc, tree at def' },
    ],
    unmapped: ['tools/new-thing/index.ts'],
    message: '2 changed feature(s) lack a verdict.',
  });

  expect(annotations).toStrictEqual([
    '::error title=verify gate::file-item: no verdict in the report',
    '::error title=verify gate::report-cost: verdict at abc, tree at def',
    '::error title=verify gate::tools/new-thing/index.ts: no feature maps this path, and no ignore glob matches it',
  ]);
});

test('it writes the message of a failure that names no feature and no path', () => {
  const annotations = formatGateAnnotations({
    kind: 'failed',
    failing: [],
    unmapped: [],
    message: 'git merge-base failed',
  });

  expect(annotations).toStrictEqual(['::error title=verify gate::git merge-base failed']);
});

test('it writes one annotation for output that holds no envelope', () => {
  expect(formatGateAnnotations({ kind: 'unreadable' })).toStrictEqual([
    '::error title=verify gate::the gate printed no envelope; read the step log',
  ]);
});

test('it escapes a line break and a percent sign, so a reason stays in one annotation', () => {
  const annotations = formatGateAnnotations({
    kind: 'failed',
    failing: [{ name: 'file-item', reason: 'the report does not match:\r\n100% of fields' }],
    unmapped: [],
    message: '1 changed feature(s) lack a verdict.',
  });

  expect(annotations).toStrictEqual([
    '::error title=verify gate::file-item: the report does not match:%0D%0A100%25 of fields',
  ]);
});
