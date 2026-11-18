import { expect, test } from 'bun:test';
import { liveCloseOutSchema } from './live-close-out-schema.ts';

test.each([
  {
    outcome: 'confirmed',
    lines: [{ criterionId: 'a1', passed: true, evidence: 'The page loads' }],
  },
  {
    outcome: 'broken',
    lines: [{ criterionId: 'a1', passed: false, evidence: 'The page shows an error' }],
    bug: {
      kind: 'bug',
      title: 'Page errors on live',
      body: 'The page shows an error.',
      acceptance: [{ text: 'The page loads', tags: ['prod'] }],
    },
  },
  { outcome: 'blocked', reason: 'Needs a write' },
  { outcome: 'abandoned', reason: 'Site is down' },
])('it parses a $outcome close-out', (raw) => {
  const parsed: unknown = liveCloseOutSchema.parse(raw);

  expect(parsed).toStrictEqual(raw);
});

test.each([
  [
    'a broken close-out with no bug',
    { outcome: 'broken', lines: [{ criterionId: 'a1', passed: false, evidence: 'Error' }] },
  ],
  [
    'a bug with no failing lines',
    {
      outcome: 'broken',
      lines: [{ criterionId: 'a1', passed: false, evidence: 'Error' }],
      bug: { kind: 'bug', title: 'Page errors', body: '', acceptance: [] },
    },
  ],
  [
    'a line with no evidence',
    { outcome: 'confirmed', lines: [{ criterionId: 'a1', passed: true, evidence: '' }] },
  ],
  [
    'a confirmed close-out with a bug',
    {
      outcome: 'confirmed',
      lines: [],
      bug: { kind: 'bug', title: 'Page errors', body: '', acceptance: [{ text: 'Loads' }] },
    },
  ],
  ['a blocked close-out with no reason', { outcome: 'blocked' }],
])('it rejects %s', (_title, raw) => {
  expect(liveCloseOutSchema.safeParse(raw).success).toBe(false);
});
