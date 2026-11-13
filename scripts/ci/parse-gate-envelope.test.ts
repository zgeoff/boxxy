import { expect, test } from 'bun:test';
import { parseGateEnvelope } from './parse-gate-envelope.ts';

test('it reads a passed gate', () => {
  const text = JSON.stringify({
    wringer: 1,
    ok: true,
    command: 'gate',
    data: { fingerprint: 'abc', failing: [], unmapped: [] },
  });

  expect(parseGateEnvelope(`${text}\n`)).toStrictEqual({ kind: 'passed' });
});

test('it reads the failing features and the unmapped paths of a failed gate', () => {
  const text = JSON.stringify({
    wringer: 1,
    ok: false,
    command: 'gate',
    data: {
      fingerprint: 'abc',
      failing: [{ name: 'file-item', reason: 'no verdict in the report' }],
      unmapped: ['tools/new-thing/index.ts'],
    },
    error: { code: 'check-failed', message: '1 changed feature(s) lack a verdict.', hint: null },
  });

  expect(parseGateEnvelope(text)).toStrictEqual({
    kind: 'failed',
    failing: [{ name: 'file-item', reason: 'no verdict in the report' }],
    unmapped: ['tools/new-thing/index.ts'],
    message: '1 changed feature(s) lack a verdict.',
  });
});

test('it reads a failure with no gate data as one with only its message', () => {
  const text = JSON.stringify({
    wringer: 1,
    ok: false,
    command: 'gate',
    data: { exitCode: 128, stderr: 'fatal: Not a valid object name origin/main\n' },
    error: { code: 'environment', message: 'git merge-base failed', hint: null },
  });

  expect(parseGateEnvelope(text)).toStrictEqual({
    kind: 'failed',
    failing: [],
    unmapped: [],
    message: 'git merge-base failed',
  });
});

test.each([
  ['empty output', ''],
  ['text that is not JSON', 'error: script "verify" exited with code 1'],
  ['a failure with no error message', JSON.stringify({ ok: false, data: {} })],
])('it reads %s as unreadable', (_name, text) => {
  expect(parseGateEnvelope(text)).toStrictEqual({ kind: 'unreadable' });
});
