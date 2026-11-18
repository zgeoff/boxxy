import { expect, test } from 'bun:test';
import { refusalDetailSchema, refusalMessageMaxChars } from './refusal-detail-schema.ts';

test('it accepts a code, a problem and a message', () => {
  const refusal = {
    code: 'host_unavailable',
    problem: 'ram_budget_exceeded',
    message: 'not enough pages',
  };

  const parsed: unknown = refusalDetailSchema.safeParse(refusal).data;

  expect(parsed).toStrictEqual(refusal);
});

test('it accepts a refusal with no problem', () => {
  const refusal = { code: 'host_unavailable', problem: null, message: 'no room' };
  const parsed: unknown = refusalDetailSchema.safeParse(refusal).data;

  expect(parsed).toStrictEqual(refusal);
});

test('it rejects a message longer than the limit', () => {
  const refusal = {
    code: 'host_unavailable',
    problem: null,
    message: 'x'.repeat(refusalMessageMaxChars + 1),
  };

  expect(refusalDetailSchema.safeParse(refusal).error?.issues).toPartiallyContain({
    path: ['message'],
  });
});
