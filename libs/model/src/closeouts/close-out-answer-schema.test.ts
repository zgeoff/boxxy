import { expect, test } from 'bun:test';
import { closeOutAnswerSchema } from './close-out-answer-schema.ts';

test.each([
  {
    kind: 'recorded',
    attempt: '0192f0c5-1a2b-7c3d-8e4f-5a6b7c8d9e0f',
    factId: '0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a',
    repeat: false,
  },
  {
    kind: 'rejected',
    problems: [
      { kind: 'schema', path: 'acceptance.0', message: 'Required' },
      { kind: 'built-without-evidence', criteria: ['a1', 'a2'] },
      { kind: 'too-large', bytes: 70_000, max: 65_536 },
    ],
  },
  { kind: 'refused', reason: 'already-closed-out' },
])('it accepts an answer of kind $kind', (answer) => {
  const parsed: unknown = closeOutAnswerSchema.safeParse(answer).data;

  expect(parsed).toStrictEqual(answer);
});

test('it rejects a refusal for a reason it does not know', () => {
  const answer = { kind: 'refused', reason: 'too-late' };

  expect(closeOutAnswerSchema.safeParse(answer).success).toBe(false);
});
